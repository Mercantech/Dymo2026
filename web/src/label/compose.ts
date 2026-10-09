import JsBarcode from 'jsbarcode'
import QRCode from 'qrcode'
import type { RawImageData } from '@mbtech-nl/bitmap'
import {
  ASPECT,
  DEFAULT_MIN_LENGTH_MM,
  DEFAULT_PAD_MM,
  GAP,
  HEAD_ROWS,
  PRINTABLE_ROWS,
  mmToFeedColumns,
  type LabelSpec,
  type LogoMode,
} from './types'

const PREVIEW_SCALE = 6

export type ComposeResult = {
  /** Head-aligned for LT driver: width = across head, height = feed. */
  image: RawImageData
  previewDataUrl: string
  /** Smaller preview for history upload. */
  historyPreviewDataUrl: string
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

function makeQrCanvas(content: string, sideHead: number): HTMLCanvasElement {
  const qr = QRCode.create(content, { errorCorrectionLevel: 'M' })
  const n = qr.modules.size
  const moduleHead = Math.max(1, Math.floor(sideHead / n))
  const moduleFeed = Math.max(1, Math.round(moduleHead * ASPECT))
  const width = moduleFeed * n
  const height = moduleHead * n

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

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Kunne ikke indlæse billede'))
    img.src = src
  })
}

function darknessAt(data: Uint8ClampedArray, i: number): number {
  const a = data[i + 3]! / 255
  const lum =
    (0.2126 * data[i]! + 0.7152 * data[i + 1]! + 0.0722 * data[i + 2]!) / 255
  return (1 - lum) * a
}

function applyHardThreshold(
  data: Uint8ClampedArray,
  out: Uint8ClampedArray,
  threshold: number,
  invert: boolean,
) {
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3]! / 255
    let black = darknessAt(data, i) >= threshold
    if (invert) black = !black && a > 0.08
    const v = black ? 0 : 255
    out[i] = v
    out[i + 1] = v
    out[i + 2] = v
    out[i + 3] = 255
  }
}

/** Floyd–Steinberg dither on darkness map → 1bpp. */
function applyDither(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  out: Uint8ClampedArray,
  threshold: number,
  invert: boolean,
) {
  const buf = new Float32Array(width * height)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      let d = darknessAt(data, i)
      if (invert) {
        const a = data[i + 3]! / 255
        d = a > 0.08 ? 1 - d : 0
      }
      // Bias threshold: higher threshold → more black after dither
      buf[y * width + x] = d + (threshold - 0.5) * 0.35
    }
  }

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x
      const old = buf[idx]!
      const black = old >= 0.5
      const neu = black ? 1 : 0
      const err = old - neu
      buf[idx] = neu

      const diffuse = (nx: number, ny: number, factor: number) => {
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) return
        buf[ny * width + nx]! += err * factor
      }
      diffuse(x + 1, y, 7 / 16)
      diffuse(x - 1, y + 1, 3 / 16)
      diffuse(x, y + 1, 5 / 16)
      diffuse(x + 1, y + 1, 1 / 16)

      const i = idx * 4
      const v = black ? 0 : 255
      out[i] = v
      out[i + 1] = v
      out[i + 2] = v
      out[i + 3] = 255
    }
  }
}

async function makeLogoCanvas(
  dataUrl: string,
  maxHead: number,
  invert: boolean,
  threshold: number,
  mode: LogoMode,
): Promise<HTMLCanvasElement> {
  const img = await loadImage(dataUrl)
  const srcW = Math.max(1, img.naturalWidth || img.width)
  const srcH = Math.max(1, img.naturalHeight || img.height)
  const headPx = Math.min(maxHead, Math.max(8, maxHead))
  const feedPx = Math.max(8, Math.round((srcW / srcH) * headPx * ASPECT))

  const scaled = document.createElement('canvas')
  scaled.width = feedPx
  scaled.height = headPx
  const sctx = scaled.getContext('2d', { willReadFrequently: true })
  if (!sctx) throw new Error('Canvas 2D ikke tilgængelig')
  sctx.fillStyle = '#ffffff'
  sctx.fillRect(0, 0, feedPx, headPx)
  sctx.imageSmoothingEnabled = true
  sctx.imageSmoothingQuality = 'high'
  sctx.drawImage(img, 0, 0, feedPx, headPx)

  const { data } = sctx.getImageData(0, 0, feedPx, headPx)
  const out = document.createElement('canvas')
  out.width = feedPx
  out.height = headPx
  const octx = out.getContext('2d')
  if (!octx) throw new Error('Canvas 2D ikke tilgængelig')
  const imgData = octx.createImageData(feedPx, headPx)
  const t = Math.min(0.95, Math.max(0.05, threshold))

  if (mode === 'dither') {
    applyDither(data, feedPx, headPx, imgData.data, t, invert)
  } else {
    applyHardThreshold(data, imgData.data, t, invert)
  }

  octx.putImageData(imgData, 0, 0)
  return out
}

function measureTextWidth(text: string, fontSize: number): number {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) return text.length * fontSize * 0.55
  ctx.font = `700 ${fontSize}px "IBM Plex Sans", sans-serif`
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

function historyPreview(src: HTMLCanvasElement): string {
  const maxW = 480
  const scale = Math.min(2, maxW / Math.max(1, src.width))
  return upscalePreview(src, Math.max(1, scale))
}

export async function composeLabel(spec: LabelSpec): Promise<ComposeResult> {
  const text = spec.text.trim()
  const qrContent = spec.qrContent.trim()
  const barcodeContent = spec.barcodeContent.trim()

  const showText = text.length > 0
  const showQr = spec.qrEnabled && qrContent.length > 0
  const showBarcode = spec.barcodeEnabled && barcodeContent.length > 0
  const showLogo = spec.logoEnabled && Boolean(spec.logoDataUrl)

  if (!showText && !showQr && !showBarcode && !showLogo) {
    throw new Error('Tilføj tekst, logo, QR eller stregkode')
  }

  const fontSize = Math.max(16, Math.min(30, Math.round(spec.fontSize)))
  const padMm = Number.isFinite(spec.padMm) ? spec.padMm : DEFAULT_PAD_MM
  const minMm = Number.isFinite(spec.minLengthMm)
    ? spec.minLengthMm
    : DEFAULT_MIN_LENGTH_MM
  const pad = mmToFeedColumns(Math.min(20, Math.max(0, padMm)))
  const minFeed = mmToFeedColumns(Math.min(120, Math.max(15, minMm)))
  const gap = Math.round(GAP * ASPECT)

  let logoCanvas: HTMLCanvasElement | null = null
  let qrCanvas: HTMLCanvasElement | null = null
  let barcodeCanvas: HTMLCanvasElement | null = null

  if (showLogo && spec.logoDataUrl) {
    logoCanvas = await makeLogoCanvas(
      spec.logoDataUrl,
      PRINTABLE_ROWS,
      spec.logoInvert,
      spec.logoThreshold ?? 0.45,
      spec.logoMode ?? 'hard',
    )
  }
  if (showQr) qrCanvas = makeQrCanvas(qrContent, PRINTABLE_ROWS)
  if (showBarcode) barcodeCanvas = makeBarcodeCanvas(barcodeContent, PRINTABLE_ROWS - 2)

  const textWidth = showText ? measureTextWidth(text, fontSize) : 0
  const logoWidth = logoCanvas?.width ?? 0
  const qrWidth = qrCanvas?.width ?? 0
  const barcodeWidth = barcodeCanvas?.width ?? 0

  const parts: number[] = []
  if (showLogo) parts.push(logoWidth)
  if (showText) parts.push(textWidth)
  if (showQr) parts.push(qrWidth)
  if (showBarcode) parts.push(barcodeWidth)
  const contentWidth =
    parts.reduce((a, b) => a + b, 0) + gap * Math.max(0, parts.length - 1)

  const width = Math.max(minFeed, contentWidth + pad * 2)

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

  if (logoCanvas) {
    const y = Math.floor((HEAD_ROWS - logoCanvas.height) / 2)
    ctx.drawImage(logoCanvas, Math.round(x), y)
    x += logoCanvas.width + gap
  }

  if (showText) {
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
    historyPreviewDataUrl: historyPreview(canvas),
    widthPx: canvas.width * PREVIEW_SCALE,
    heightPx: canvas.height * PREVIEW_SCALE,
  }
}
