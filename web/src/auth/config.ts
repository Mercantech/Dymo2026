export const AUTH_ISSUER = 'https://auth.mercantec.tech'
export const AUTH_AUTHORIZE = `${AUTH_ISSUER}/oauth/authorize`
export const AUTH_TOKEN = `${AUTH_ISSUER}/oauth/token`
export const AUTH_SIGNOUT = `${AUTH_ISSUER}/signout`

export const AUTH_CLIENT_ID =
  (import.meta.env.VITE_AUTH_CLIENT_ID as string | undefined) || 'dymotag'

export function getRedirectUri(): string {
  return `${window.location.origin}/callback`
}

const PKCE_KEY = 'dymotag_pkce'
const TOKENS_KEY = 'dymotag_tokens'

export type StoredTokens = {
  access_token: string
  refresh_token: string
  expires_at: number
  token_type: string
}

export type PkceSession = {
  code_verifier: string
  state: string
}

export function savePkce(session: PkceSession): void {
  sessionStorage.setItem(PKCE_KEY, JSON.stringify(session))
}

export function takePkce(): PkceSession | null {
  const raw = sessionStorage.getItem(PKCE_KEY)
  sessionStorage.removeItem(PKCE_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as PkceSession
  } catch {
    return null
  }
}

export function saveTokens(tokens: StoredTokens): void {
  sessionStorage.setItem(TOKENS_KEY, JSON.stringify(tokens))
}

export function loadTokens(): StoredTokens | null {
  const raw = sessionStorage.getItem(TOKENS_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as StoredTokens
  } catch {
    return null
  }
}

export function clearTokens(): void {
  sessionStorage.removeItem(TOKENS_KEY)
}
