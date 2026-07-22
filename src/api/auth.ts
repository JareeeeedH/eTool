import { apiUrl, getApiConfigError, readApiError } from './http'
import { setApiSessionToken } from '../auth/sessionToken'

export type LoginResult =
  | { ok: true; token: string; expiresAt: number }
  | { ok: false; error: string }

export async function loginWithPinAsync(pin: string): Promise<LoginResult> {
  const configError = getApiConfigError()
  if (configError) {
    return { ok: false, error: configError }
  }

  try {
    const res = await fetch(apiUrl('/api/auth/login'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin }),
    })

    if (!res.ok) {
      if (res.status === 401) {
        return { ok: false, error: 'pin' }
      }
      return {
        ok: false,
        error: await readApiError(res, `登入失敗（HTTP ${res.status}）`),
      }
    }

    const body: unknown = await res.json()
    if (
      typeof body !== 'object' ||
      body === null ||
      typeof (body as { token?: unknown }).token !== 'string' ||
      typeof (body as { expiresAt?: unknown }).expiresAt !== 'number'
    ) {
      return { ok: false, error: '登入回應格式錯誤' }
    }

    const token = (body as { token: string }).token
    const expiresAt = (body as { expiresAt: number }).expiresAt
    setApiSessionToken(token, expiresAt)
    return { ok: true, token, expiresAt }
  } catch {
    return { ok: false, error: '無法連線後端，請確認 exchange-api 是否在跑' }
  }
}
