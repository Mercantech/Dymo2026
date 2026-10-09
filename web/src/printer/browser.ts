export type BrowserSupport = {
  ok: boolean
  bluetooth: boolean
  secureContext: boolean
  chromium: boolean
  brave: boolean
  issues: string[]
}

function detectBrave(): boolean {
  const nav = navigator as Navigator & { brave?: unknown }
  return Boolean(nav.brave) || /Brave/i.test(navigator.userAgent)
}

export function checkBrowserSupport(): BrowserSupport {
  const bluetooth = typeof navigator !== 'undefined' && 'bluetooth' in navigator
  const secureContext =
    typeof window !== 'undefined' &&
    (window.isSecureContext ||
      location.hostname === 'localhost' ||
      location.hostname === '127.0.0.1')

  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''
  const chromium =
    /Chrome|Chromium|Edg|CriOS/i.test(ua) && !/Firefox|FxiOS/i.test(ua)
  const brave = typeof navigator !== 'undefined' && detectBrave()

  const issues: string[] = []
  if (!chromium) {
    issues.push(
      'Brug Chrome, Edge eller Brave (Web Bluetooth mangler i Safari/Firefox).',
    )
  }
  if (!secureContext) {
    issues.push('Kræver HTTPS eller localhost.')
  }
  if (!bluetooth) {
    if (brave) {
      issues.push(
        'Brave har Web Bluetooth slået fra. Åbn brave://flags/#brave-web-bluetooth-api → Enabled → Relaunch.',
      )
    } else {
      issues.push('Denne browser eksponerer ikke Web Bluetooth.')
    }
  } else if (brave) {
    issues.push(
      'Brave: hvis print fejler med “globally disabled”, sæt brave://flags/#brave-web-bluetooth-api til Enabled og genstart.',
    )
  }

  return {
    ok: bluetooth && secureContext && chromium,
    bluetooth,
    secureContext,
    chromium,
    brave,
    issues,
  }
}

export function formatBluetoothError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  if (/globally disabled/i.test(message)) {
    return (
      'Web Bluetooth er slået fra i browseren. ' +
      'I Brave: brave://flags/#brave-web-bluetooth-api → Enabled → Relaunch. ' +
      'Ellers brug Chrome eller Edge.'
    )
  }
  return message || 'Forbindelse fejlede'
}
