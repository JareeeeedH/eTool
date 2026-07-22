const SESSION_KEY = 'exchange.apiSession'

type StoredSession = {
  token: string
  expiresAt: number
}

function readSession(): StoredSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<StoredSession>
    if (typeof parsed.token !== 'string' || typeof parsed.expiresAt !== 'number') {
      clearApiSessionToken()
      return null
    }
    return { token: parsed.token, expiresAt: parsed.expiresAt }
  } catch {
    clearApiSessionToken()
    return null
  }
}

export function getApiSessionToken(): string | null {
  const session = readSession()
  if (!session) return null
  if (session.expiresAt <= Date.now()) {
    clearApiSessionToken()
    return null
  }
  return session.token
}

export function hasValidApiSession(): boolean {
  return getApiSessionToken() !== null
}

export function setApiSessionToken(token: string, expiresAt: number): void {
  const payload: StoredSession = { token, expiresAt }
  localStorage.setItem(SESSION_KEY, JSON.stringify(payload))
}

export function clearApiSessionToken(): void {
  localStorage.removeItem(SESSION_KEY)
}
