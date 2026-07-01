const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '')
const API_TOKEN = import.meta.env.VITE_API_TOKEN ?? ''

export function getApiConfigError(): string | null {
  if (!API_BASE_URL) return '請在 .env 設定 VITE_API_BASE_URL'
  if (!API_TOKEN) return '請在 .env 設定 VITE_API_TOKEN'
  return null
}

export function apiBearerHeader(): string {
  return `Bearer ${API_TOKEN}`
}

export function apiAuthHeaders(): HeadersInit {
  return {
    Authorization: apiBearerHeader(),
    'Content-Type': 'application/json',
  }
}

export function apiUrl(path: string): string {
  return `${API_BASE_URL}${path}`
}

export async function readApiError(res: Response, fallback: string): Promise<string> {
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
