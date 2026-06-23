const DEVICE_AUTH_KEY = 'exchange.deviceAuth'

export type DeviceAuthRecord = {
  user: 'y'
}

export function isDeviceAuthed(): boolean {
  try {
    const raw = localStorage.getItem(DEVICE_AUTH_KEY)
    if (!raw) return false
    const parsed = JSON.parse(raw) as Partial<DeviceAuthRecord>
    return parsed.user === 'y'
  } catch {
    return false
  }
}

export function markDeviceAuthed(): void {
  const record: DeviceAuthRecord = { user: 'y' }
  localStorage.setItem(DEVICE_AUTH_KEY, JSON.stringify(record))
}

export function getAccessPin(): string {
  const fromEnv = import.meta.env.VITE_ACCESS_PIN?.trim()
  return fromEnv || '0808'
}

export function verifyAccessPin(pin: string): boolean {
  return pin === getAccessPin()
}
