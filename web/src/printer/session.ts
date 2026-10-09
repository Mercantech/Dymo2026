import type { RawImageData } from '@mbtech-nl/bitmap'
import {
  DEVICES,
  LT_PAPER_WHITE,
  requestPrinter,
  LetraTagPrinter,
  type LetraTagPrintOptions,
  type PrinterStatus,
} from '@thermal-label/letratag-web'
import { WebBluetoothTransport } from '@thermal-label/transport/web'

export type { RawImageData }

const SERVICE_PREFIX = 'be3dd650-'

let printer: LetraTagPrinter | null = null
let deviceName: string | null = null

function isLetraTagName(name: string | undefined): boolean {
  if (!name) return false
  return (
    name.startsWith('Letratag ') ||
    name.startsWith('DYMO LT-200B') ||
    /letratag|lt-200b/i.test(name)
  )
}

export function getConnectedName(): string | null {
  return printer?.connected ? deviceName : null
}

export function isPrinterConnected(): boolean {
  return Boolean(printer?.connected)
}

async function bindPrinter(device: BluetoothDevice): Promise<string> {
  if (!device.gatt) throw new Error('Enheden har ingen GATT-server')

  const server = device.gatt.connected
    ? device.gatt
    : await device.gatt.connect()

  const services = await server.getPrimaryServices()
  const matched = services.find((s) => s.uuid.startsWith(SERVICE_PREFIX))
  if (!matched) {
    throw new Error('Ingen LetraTag GATT-service på enheden')
  }

  const ble = DEVICES.LT_200B.transports['bluetooth-gatt']
  const tail = matched.uuid.slice(8)
  const txUuid = `be3dd651${tail}`
  const rxUuid = `be3dd652${tail}`

  const txCharacteristic = await matched.getCharacteristic(txUuid)
  const rxCharacteristic = await matched.getCharacteristic(rxUuid)
  await rxCharacteristic.startNotifications()

  const transport = WebBluetoothTransport.fromCharacteristics(
    device,
    txCharacteristic,
    rxCharacteristic,
    ble?.mtu ?? 247,
  )

  printer = new LetraTagPrinter(DEVICES.LT_200B, transport)
  const name = device.name || printer.model || 'LT-200B'
  deviceName = name
  return name
}

/** Previously permitted printers (Chrome/Edge/Brave with Web Bluetooth). */
async function getKnownLetraTags(): Promise<BluetoothDevice[]> {
  const bt = navigator.bluetooth as Bluetooth & {
    getDevices?: () => Promise<BluetoothDevice[]>
  }
  if (!bt?.getDevices) return []
  try {
    const devices = await bt.getDevices()
    return devices.filter((d) => isLetraTagName(d.name))
  } catch {
    return []
  }
}

async function connectKnown(): Promise<string | null> {
  const known = await getKnownLetraTags()
  for (const device of known) {
    try {
      return await bindPrinter(device)
    } catch {
      // try next / fall through
    }
  }
  return null
}

async function connectWithPicker(): Promise<string> {
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

/**
 * Connect to printer. Prefers an already-permitted device (no picker).
 * Pass `{ forcePicker: true }` to open the browser chooser.
 */
export async function connectPrinter(
  options: { forcePicker?: boolean } = {},
): Promise<string> {
  if (printer?.connected) {
    await printer.close().catch(() => undefined)
    printer = null
  }

  if (!options.forcePicker) {
    const name = await connectKnown()
    if (name) return name
  }

  return connectWithPicker()
}

/** Silent reconnect on page load — null if none paired / unavailable. */
export async function tryAutoConnect(): Promise<string | null> {
  if (printer?.connected) return deviceName
  try {
    return await connectKnown()
  } catch {
    return null
  }
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
