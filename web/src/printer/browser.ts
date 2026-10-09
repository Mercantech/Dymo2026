export type BrowserSupport = {
  ok: boolean
  bluetooth: boolean
  secureContext: boolean
  chromium: boolean
  issues: string[]
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

  const issues: string[] = []
  if (!chromium) {
    issues.push('Brug Chrome eller Edge (Web Bluetooth mangler i Safari/Firefox).')
  }
  if (!secureContext) {
    issues.push('Kræver HTTPS eller localhost.')
  }
  if (!bluetooth) {
    issues.push('Denne browser eksponerer ikke Web Bluetooth.')
  }

  return {
    ok: bluetooth && secureContext && chromium,
    bluetooth,
    secureContext,
    chromium,
    issues,
  }
}
