import { getApiSessionToken } from '../auth/sessionToken'
import { handleApiUnauthorized } from '../auth/deviceAccess'

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '')

export function getApiConfigError(): string | null {
  if (!API_BASE_URL) return '請在 .env 設定 VITE_API_BASE_URL'
  return null
}

export function apiBearerHeader(): string {
  const token = getApiSessionToken()
  return token ? `Bearer ${token}` : ''
}

export function apiAuthHeaders(): HeadersInit {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  const bearer = apiBearerHeader()
  if (bearer) headers.Authorization = bearer
  return headers
}

export function apiUrl(path: string): string {
  return `${API_BASE_URL}${path}`
}

export async function readApiError(res: Response, fallback: string): Promise<string> {
  if (res.status === 401) {
    handleApiUnauthorized()
  }
  try {
    const body: unknown = await res.json()
    if (typeof body === 'object' && body !== null && 'error' in body) {
      const message = (body as { error: unknown }).error
      if (typeof message === 'string' && message.length > 0) return message
    }
  } catch {
    // ignore
  }
  return fallback
}

/** fetch 後若 401，清 session（給 persistence 等未走 readApiError 的路徑） */
export function noteUnauthorizedStatus(status: number): void {
  if (status === 401) handleApiUnauthorized()
}
