import type { RawImageData } from '@mbtech-nl/bitmap'
import {
  LT_PAPER_WHITE,
  requestPrinter,
  type LetraTagPrinter,
  type LetraTagPrintOptions,
  type PrinterStatus,
} from '@thermal-label/letratag-web'

export type { RawImageData }

let printer: LetraTagPrinter | null = null
let deviceName: string | null = null

export function getConnectedName(): string | null {
  return printer?.connected ? deviceName : null
}

export function isPrinterConnected(): boolean {
  return Boolean(printer?.connected)
}

export async function connectPrinter(): Promise<string> {
  if (printer?.connected) {
    await printer.close().catch(() => undefined)
    printer = null
  }

  // Accept both current "Letratag " and older "DYMO LT-200B" prefixes.
  const result = await requestPrinter({
    namePrefix: 'Letratag ',
  }).catch(async () =>
    requestPrinter({
      namePrefix: 'DYMO LT-200B',
    }),
  )

  printer = result.printer
  const name = result.device?.name || result.printer.model || 'LT-200B'
  deviceName = name
  return name
}

export async function disconnectPrinter(): Promise<void> {
  if (printer) {
    await printer.close().catch(() => undefined)
  }
  printer = null
  deviceName = null
}

export async function printLabel(
  image: RawImageData,
  options: LetraTagPrintOptions = {},
): Promise<PrinterStatus | null> {
  if (!printer?.connected) {
    throw new Error('Ingen printer forbundet')
  }

  // Image is already head-aligned (width = across tape, height = feed).
  // Do not use rotate:'auto' — that treated our old landscape as tiny stubs.
  await printer.print(image, LT_PAPER_WHITE, {
    copies: options.copies ?? 1,
    autoCut: options.autoCut ?? true,
    rotate: options.rotate ?? 0,
  })

  return printer.getStatus()
}

export function subscribeStatus(
  cb: (status: PrinterStatus) => void,
): () => void {
  if (!printer) return () => undefined
  return printer.onStatus(cb)
}
