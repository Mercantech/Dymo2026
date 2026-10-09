import {
  AUTH_AUTHORIZE,
  AUTH_CLIENT_ID,
  AUTH_TOKEN,
  clearTokens,
  getRedirectUri,
  loadTokens,
  savePkce,
  saveTokens,
  takePkce,
  type StoredTokens,
} from './config'
import { createPkcePair, randomString } from './pkce'

function requireClientId(): string {
  if (!AUTH_CLIENT_ID) {
    throw new Error('VITE_AUTH_CLIENT_ID er ikke sat')
  }
  return AUTH_CLIENT_ID
}

export function isLoggedIn(): boolean {
  const tokens = loadTokens()
  return Boolean(tokens?.access_token)
}

export async function beginLogin(): Promise<void> {
  const clientId = requireClientId()
  const { code_verifier, code_challenge } = await createPkcePair()
  const state = randomString(16)
  savePkce({ code_verifier, state })

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: getRedirectUri(),
    state,
    code_challenge,
    code_challenge_method: 'S256',
  })

  window.location.assign(`${AUTH_AUTHORIZE}?${params.toString()}`)
}

export async function handleCallback(url: URL): Promise<void> {
  const error = url.searchParams.get('error')
  if (error) {
    throw new Error(url.searchParams.get('error_description') || error)
  }

  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const pkce = takePkce()

  if (!code || !state || !pkce || state !== pkce.state) {
    throw new Error('Ugyldig OAuth-callback (state/code mangler)')
  }

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: getRedirectUri(),
    client_id: requireClientId(),
    code_verifier: pkce.code_verifier,
  })

  const res = await fetch(AUTH_TOKEN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Token-udveksling fejlede: ${res.status} ${text}`)
  }

  const json = (await res.json()) as {
    access_token: string
    refresh_token: string
    expires_in: number
    token_type: string
  }

  saveTokens({
    access_token: json.access_token,
    refresh_token: json.refresh_token,
    expires_at: Date.now() + json.expires_in * 1000,
    token_type: json.token_type || 'Bearer',
  })
}

async function refreshTokens(current: StoredTokens): Promise<StoredTokens> {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: current.refresh_token,
    client_id: requireClientId(),
  })

  const res = await fetch(AUTH_TOKEN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })

  if (!res.ok) {
    clearTokens()
    throw new Error('Session udløbet — log ind igen')
  }

  const json = (await res.json()) as {
    access_token: string
    refresh_token: string
    expires_in: number
    token_type: string
  }

  const next: StoredTokens = {
    access_token: json.access_token,
    refresh_token: json.refresh_token || current.refresh_token,
    expires_at: Date.now() + json.expires_in * 1000,
    token_type: json.token_type || 'Bearer',
  }
  saveTokens(next)
  return next
}

export async function getAccessToken(): Promise<string | null> {
  let tokens = loadTokens()
  if (!tokens) return null

  if (Date.now() > tokens.expires_at - 30_000) {
    tokens = await refreshTokens(tokens)
  }
  return tokens.access_token
}

/** Log kun ud af denne SPA — rør ikke auth.mercantec.tech-sessionen. */
export function logout(): void {
  clearTokens()
  window.location.assign('/login')
}

export function parseDisplayName(): string | null {
  const tokens = loadTokens()
  if (!tokens?.access_token) return null
  try {
    const payload = tokens.access_token.split('.')[1]
    if (!payload) return null
    const json = JSON.parse(
      atob(payload.replace(/-/g, '+').replace(/_/g, '/')),
    ) as { name?: string; email?: string }
    return json.name || json.email || null
  } catch {
    return null
  }
}
