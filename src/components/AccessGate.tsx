import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import {
  DEVICE_LOCK_MS,
  isDeviceAuthed,
  markDeviceAuthed,
  markDeviceHidden,
  syncDeviceAuthState,
  touchDeviceActivity,
  verifyAccessPin,
} from '../auth/deviceAccess'

const LOCK_CHECK_INTERVAL_MS = 30_000

const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'touchstart'] as const

export function AccessGate({ children }: { children: ReactNode }) {
  const [authed, setAuthed] = useState(() => isDeviceAuthed())
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!authed) {
      inputRef.current?.focus()
    }
  }, [authed])

  useEffect(() => {
    const syncAuth = () => {
      setAuthed(syncDeviceAuthState())
    }

    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        markDeviceHidden()
        return
      }
      syncAuth()
    }

    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) {
        syncAuth()
      }
    }

    const onPageHide = () => {
      markDeviceHidden()
    }

    syncAuth()
    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('pageshow', onPageShow)
    window.addEventListener('pagehide', onPageHide)
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener('pageshow', onPageShow)
      window.removeEventListener('pagehide', onPageHide)
    }
  }, [])

  useEffect(() => {
    if (!authed) return

    const bumpActivity = () => {
      touchDeviceActivity()
    }

    for (const eventName of ACTIVITY_EVENTS) {
      window.addEventListener(eventName, bumpActivity, { passive: true })
    }

    const lockTimer = window.setInterval(() => {
      if (document.visibilityState === 'hidden') return
      if (!isDeviceAuthed()) {
        setAuthed(false)
      }
    }, Math.min(LOCK_CHECK_INTERVAL_MS, DEVICE_LOCK_MS))

    return () => {
      for (const eventName of ACTIVITY_EVENTS) {
        window.removeEventListener(eventName, bumpActivity)
      }
      window.clearInterval(lockTimer)
    }
  }, [authed])

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (verifyAccessPin(pin)) {
      markDeviceAuthed()
      setError('')
      setPin('')
      setAuthed(true)
      return
    }
    setError('驗證失敗')
    setPin('')
    inputRef.current?.focus()
  }

  if (authed) {
    return children
  }

  return (
    <div className="flex h-dvh items-center justify-center bg-white">
      <form onSubmit={handleSubmit} className="w-full max-w-xs px-4">
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="password"
            inputMode="text"
            autoComplete="off"
            maxLength={16}
            value={pin}
            onChange={(event) => {
              setPin(event.target.value)
              if (error) setError('')
            }}
            className="min-w-0 flex-1 rounded border border-slate-300 px-3 py-2 text-center text-base tracking-[0.15em] text-slate-800 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-500/20 sm:text-sm"
            aria-label="驗證碼"
          />
          <button
            type="submit"
            aria-label="確認"
            className="flex shrink-0 items-center justify-center rounded bg-slate-900 p-2 text-white transition hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-500/30"
          >
            <svg
              className="h-4 w-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </button>
        </div>
        {error && (
          <p className="mt-2 text-center text-xs text-rose-600" role="alert">
            {error}
          </p>
        )}
      </form>
    </div>
  )
}
