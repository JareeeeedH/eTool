import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import {
  DEVICE_LOCK_MS,
  isDeviceAuthed,
  markDeviceAuthed,
  markDeviceHidden,
  resumeDeviceAuth,
  touchDeviceActivity,
  verifyAccessPin,
} from './deviceAccess'

const storage = new Map<string, string>()

function installLocalStorageMock(): void {
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => {
      storage.set(key, value)
    },
    removeItem: (key: string) => {
      storage.delete(key)
    },
    clear: () => storage.clear(),
  })
}

describe('deviceAccess lock windows', () => {
  beforeEach(() => {
    storage.clear()
    installLocalStorageMock()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-07T00:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    storage.clear()
  })

  it('stays authed when returning from background within lock window', () => {
    markDeviceAuthed()
    markDeviceHidden()
    vi.advanceTimersByTime(DEVICE_LOCK_MS - 1)
    expect(resumeDeviceAuth()).toBe(true)
    expect(isDeviceAuthed()).toBe(true)
  })

  it('requires re-auth after background exceeds lock window', () => {
    markDeviceAuthed()
    markDeviceHidden()
    vi.advanceTimersByTime(DEVICE_LOCK_MS)
    expect(resumeDeviceAuth()).toBe(false)
    expect(isDeviceAuthed()).toBe(false)
  })

  it('requires re-auth after session max even with recent activity', () => {
    markDeviceAuthed()
    vi.advanceTimersByTime(DEVICE_LOCK_MS - 1)
    touchDeviceActivity()
    vi.advanceTimersByTime(1)
    expect(isDeviceAuthed()).toBe(false)
  })

  it('requires re-auth when idle without activity', () => {
    markDeviceAuthed()
    vi.advanceTimersByTime(DEVICE_LOCK_MS)
    expect(isDeviceAuthed()).toBe(false)
  })
})

describe('verifyAccessPin', () => {
  it('accepts configured pin', () => {
    expect(verifyAccessPin('pev0808')).toBe(true)
  })
})
