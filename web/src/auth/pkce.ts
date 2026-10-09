function base64UrlEncode(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  let binary = ''
  for (const b of arr) binary += String.fromCharCode(b)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function randomString(byteLength = 32): string {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength))
  return base64UrlEncode(bytes)
}

export async function createPkcePair(): Promise<{
  code_verifier: string
  code_challenge: string
}> {
  const code_verifier = randomString(32)
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(code_verifier),
  )
  return {
    code_verifier,
    code_challenge: base64UrlEncode(digest),
  }
}
