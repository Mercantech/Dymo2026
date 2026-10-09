import JsBarcode from 'jsbarcode'
import QRCode from 'qrcode'
import type { RawImageData } from '@mbtech-nl/bitmap'
import { GAP, HEAD_ROWS, H_PAD, MIN_FEED_COLUMNS, type LabelSpec } from './types'

export type ComposeResult = {
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

async function makeQrCanvas(content: string, size: number): Promise<HTMLCanvasElement> {
  const canvas = document.createElement('canvas')
  await QRCode.toCanvas(canvas, content, {
    errorCorrectionLevel: 'M',
    margin: 0,
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
    width: 1.4,
    background: '#ffffff',
    lineColor: '#000000',
  })
  return canvas
}

function measureTextWidth(text: string, fontSize: number): number {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) return text.length * fontSize * 0.6
  ctx.font = `600 ${fontSize}px "IBM Plex Sans", sans-serif`
  return Math.ceil(ctx.measureText(text).width)
}

/**
 * Build a 32-row tape label: text + optional QR + optional Code128 in a row.
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

  const fontSize = Math.max(10, Math.min(28, Math.round(spec.fontSize)))
  const qrSize = HEAD_ROWS - 2
  const barcodeHeight = HEAD_ROWS - 4

  let qrCanvas: HTMLCanvasElement | null = null
  let barcodeCanvas: HTMLCanvasElement | null = null

  if (showQr) qrCanvas = await makeQrCanvas(qrContent, qrSize)
  if (showBarcode) barcodeCanvas = makeBarcodeCanvas(barcodeContent, barcodeHeight)

  const textWidth = showText ? measureTextWidth(text, fontSize) : 0
  const qrWidth = qrCanvas?.width ?? 0
  const barcodeWidth = barcodeCanvas?.width ?? 0

  let contentWidth = 0
  const parts: number[] = []
  if (showText) parts.push(textWidth)
  if (showQr) parts.push(qrWidth)
  if (showBarcode) parts.push(barcodeWidth)
  contentWidth = parts.reduce((a, b) => a + b, 0) + GAP * Math.max(0, parts.length - 1)

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
    ctx.font = `600 ${fontSize}px "IBM Plex Sans", sans-serif`
    ctx.textBaseline = 'middle'
    ctx.fillText(text, x, HEAD_ROWS / 2)
    x += textWidth + GAP
  }

  if (qrCanvas) {
    const y = Math.floor((HEAD_ROWS - qrCanvas.height) / 2)
    ctx.drawImage(qrCanvas, x, y)
    x += qrCanvas.width + GAP
  }

  if (barcodeCanvas) {
    const y = Math.floor((HEAD_ROWS - barcodeCanvas.height) / 2)
    ctx.drawImage(barcodeCanvas, x, y)
  }

  const image = canvasToRaw(canvas)
  const previewDataUrl = canvas.toDataURL('image/png')

  return {
    image,
    previewDataUrl,
    widthPx: width,
    heightPx: HEAD_ROWS,
  }
}
