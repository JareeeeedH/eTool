import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import {
  DEVICE_LOCK_MS,
  isDeviceAuthed,
  markDeviceAuthed,
  markDeviceHidden,
  resumeDeviceAuth,
  touchDeviceActivity,
} from './deviceAccess'
import { setApiSessionToken } from './sessionToken'

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

function seedSession(ttlMs = DEVICE_LOCK_MS * 10): void {
  setApiSessionToken('test-session-token', Date.now() + ttlMs)
}

describe('deviceAccess lock windows', () => {
  beforeEach(() => {
    storage.clear()
    installLocalStorageMock()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-07T00:00:00Z'))
    seedSession()
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

  it('rejects legacy record without authedAt', () => {
    localStorage.setItem('exchange.deviceAuth', JSON.stringify({ user: 'y' }))
    expect(isDeviceAuthed()).toBe(false)
    expect(localStorage.getItem('exchange.deviceAuth')).toBeNull()
  })

  it('requires re-auth on cold load after session expires', () => {
    const authedAt = Date.now() - DEVICE_LOCK_MS - 1
    localStorage.setItem(
      'exchange.deviceAuth',
      JSON.stringify({
        user: 'y',
        authedAt,
        hiddenAt: null,
        lastActivityAt: authedAt,
      }),
    )
    expect(isDeviceAuthed()).toBe(false)
  })

  it('requires re-auth when api session is missing', () => {
    markDeviceAuthed()
    localStorage.removeItem('exchange.apiSession')
    expect(isDeviceAuthed()).toBe(false)
  })
})
