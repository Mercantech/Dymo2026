import { getAccessToken } from '../auth/auth'

const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) || '/api'

export type PrintJobDto = {
  id: string
  createdAt: string
  copies: number
  autoCut: boolean
  title: string
  previewDataUrl: string
  specJson: string
}

export type AdminStats = {
  totalPrints: number
  printsLast7Days: number
  uniqueUsers: number
  totalCopies: number
  topUsers: Array<{
    userSub: string
    displayName: string
    prints: number
    copies: number
    lastAt: string
  }>
  perDay: Array<{ date: string; prints: number }>
}

export type MeResponse = {
  sub: string
  name: string | null
  isAdmin: boolean
}

async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = await getAccessToken()
  if (!token) throw new Error('Ikke logget ind')

  const headers = new Headers(init.headers)
  headers.set('Authorization', `Bearer ${token}`)
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  const res = await fetch(`${API_BASE}${path}`, { ...init, headers })
  if (res.status === 401) throw new Error('Session udløbet — log ind igen')
  if (res.status === 403) throw new Error('Ingen adgang')
  return res
}

export async function fetchMe(): Promise<MeResponse> {
  const res = await apiFetch('/me')
  if (!res.ok) throw new Error('Kunne ikke hente bruger')
  return (await res.json()) as MeResponse
}

export async function fetchPrintHistory(): Promise<PrintJobDto[]> {
  const res = await apiFetch('/prints')
  if (!res.ok) throw new Error('Kunne ikke hente historik')
  return (await res.json()) as PrintJobDto[]
}

export async function savePrintJob(body: {
  specJson: string
  previewDataUrl: string
  copies: number
  autoCut: boolean
  title?: string
}): Promise<PrintJobDto> {
  const res = await apiFetch('/prints', {
    method: 'POST',
    body: JSON.stringify({
      specJson: body.specJson,
      previewDataUrl: body.previewDataUrl,
      copies: body.copies,
      autoCut: body.autoCut,
      title: body.title ?? null,
    }),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(text || 'Kunne ikke gemme print')
  }
  return (await res.json()) as PrintJobDto
}

export async function deletePrintJob(id: string): Promise<void> {
  const res = await apiFetch(`/prints/${id}`, { method: 'DELETE' })
  if (!res.ok && res.status !== 204) throw new Error('Kunne ikke slette')
}

export async function fetchAdminStats(): Promise<AdminStats> {
  const res = await apiFetch('/admin/stats')
  if (!res.ok) throw new Error('Kunne ikke hente statistik')
  return (await res.json()) as AdminStats
}
