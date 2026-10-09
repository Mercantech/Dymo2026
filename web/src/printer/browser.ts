export function formatBluetoothError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  if (/globally disabled/i.test(message)) {
    return (
      'Web Bluetooth er slået fra i browseren. ' +
      'I Brave: brave://flags/#brave-web-bluetooth-api → Enabled → Relaunch. ' +
      'Ellers brug Chrome eller Edge.'
    )
  }
  if (/bluetooth/i.test(message) && /not available|unsupported|undefined/i.test(message)) {
    return 'Web Bluetooth understøttes ikke i denne browser. Brug Chrome, Edge eller Brave (med Bluetooth aktiveret).'
  }
  return message || 'Forbindelse fejlede'
}
