const DEVICE_AUTH_KEY = 'exchange.deviceAuth'

/** PIN 重新驗證間隔：背景／閒置／最長停留（毫秒） */
export const DEVICE_LOCK_MS = 5 * 60 * 1000

/** @deprecated 請改用 DEVICE_LOCK_MS */
export const DEVICE_BACKGROUND_LOCK_MS = DEVICE_LOCK_MS

const ACTIVITY_PERSIST_THROTTLE_MS = 30_000

export type DeviceAuthRecord = {
  user: 'y'
  authedAt: number
  hiddenAt: number | null
  lastActivityAt: number
}

function readRecord(): DeviceAuthRecord | null {
  try {
    const raw = localStorage.getItem(DEVICE_AUTH_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<DeviceAuthRecord>
    if (parsed.user !== 'y') return null

    // 舊版僅存 { user: 'y' } 時視為無效，避免每次讀取都重置計時
    if (typeof parsed.authedAt !== 'number') {
      clearDeviceAuth()
      return null
    }

    const authedAt = parsed.authedAt
    return {
      user: 'y',
      authedAt,
      hiddenAt: typeof parsed.hiddenAt === 'number' ? parsed.hiddenAt : null,
      lastActivityAt:
        typeof parsed.lastActivityAt === 'number' ? parsed.lastActivityAt : authedAt,
    }
  } catch {
    return null
  }
}

function writeRecord(record: DeviceAuthRecord): void {
  localStorage.setItem(DEVICE_AUTH_KEY, JSON.stringify(record))
}

function isBackgroundLockExpired(hiddenAt: number | null): boolean {
  if (hiddenAt === null) return false
  return Date.now() - hiddenAt >= DEVICE_LOCK_MS
}

function isSessionLockExpired(authedAt: number): boolean {
  return Date.now() - authedAt >= DEVICE_LOCK_MS
}

function isIdleLockExpired(lastActivityAt: number): boolean {
  return Date.now() - lastActivityAt >= DEVICE_LOCK_MS
}

function isRecordExpired(record: DeviceAuthRecord): boolean {
  return (
    isBackgroundLockExpired(record.hiddenAt) ||
    isSessionLockExpired(record.authedAt) ||
    isIdleLockExpired(record.lastActivityAt)
  )
}

export function clearDeviceAuth(): void {
  localStorage.removeItem(DEVICE_AUTH_KEY)
}

export function isDeviceAuthed(): boolean {
  const record = readRecord()
  if (!record) return false
  if (isRecordExpired(record)) {
    clearDeviceAuth()
    return false
  }
  return true
}

export function markDeviceAuthed(): void {
  const now = Date.now()
  writeRecord({
    user: 'y',
    authedAt: now,
    hiddenAt: null,
    lastActivityAt: now,
  })
}

/** 使用者操作時更新閒置計時（節流寫入） */
export function touchDeviceActivity(): void {
  const record = readRecord()
  if (!record || isRecordExpired(record)) return
  const now = Date.now()
  if (now - record.lastActivityAt < ACTIVITY_PERSIST_THROTTLE_MS) return
  writeRecord({ ...record, lastActivityAt: now })
}

/** App 切到背景或關閉分頁時記錄時間 */
export function markDeviceHidden(): void {
  const record = readRecord()
  if (!record || isRecordExpired(record)) {
    clearDeviceAuth()
    return
  }
  writeRecord({ ...record, hiddenAt: Date.now() })
}

/**
 * App 回到前景：若未超過鎖定時間則維持登入。
 * @returns 是否仍視為已驗證
 */
export function resumeDeviceAuth(): boolean {
  const record = readRecord()
  if (!record) return false
  if (isRecordExpired(record)) {
    clearDeviceAuth()
    return false
  }
  if (record.hiddenAt !== null) {
    writeRecord({ ...record, hiddenAt: null, lastActivityAt: Date.now() })
  }
  return true
}

/** 重新讀取 localStorage 並同步驗證狀態（用於重整、bfcache 還原） */
export function syncDeviceAuthState(): boolean {
  return resumeDeviceAuth()
}

export function getAccessPin(): string {
  const fromEnv = import.meta.env.VITE_ACCESS_PIN?.trim()
  return fromEnv || 'pev0808'
}

export function verifyAccessPin(pin: string): boolean {
  return pin === getAccessPin()
}
