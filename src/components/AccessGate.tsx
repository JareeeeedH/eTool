import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { loginWithPinAsync } from '../api/auth'
import {
  DEVICE_LOCK_MS,
  isDeviceAuthed,
  markDeviceAuthed,
  markDeviceHidden,
  syncDeviceAuthState,
  touchDeviceActivity,
} from '../auth/deviceAccess'

const LOCK_CHECK_INTERVAL_MS = 30_000
const APP_TITLE = 'PEV-LIST'
const APP_FAVICON = '/favicon.svg'
const GOOGLE_FAVICON = '/google-favicon.svg'

const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'touchstart'] as const

const GOOGLE_LOGO = [
  { id: 'g1', char: 'G', color: '#4285F4' },
  { id: 'o1', char: 'o', color: '#EA4335' },
  { id: 'o2', char: 'o', color: '#FBBC05' },
  { id: 'g2', char: 'g', color: '#4285F4' },
  { id: 'l', char: 'l', color: '#34A853' },
  { id: 'e', char: 'e', color: '#EA4335' },
] as const

const TOP_LINK_CLASS =
  'rounded px-2 py-1.5 text-[13px] leading-none text-[#202124] transition hover:bg-[#f1f3f4]'

function FakeGoogleLogo() {
  return (
    <h1
      className="mb-6 select-none text-center sm:mb-8"
      style={{
        fontFamily: 'arial, sans-serif',
        fontSize: 'clamp(3.25rem, 11vw, 5.5rem)',
        fontWeight: 400,
        letterSpacing: '-2.5px',
        lineHeight: 1,
      }}
      aria-hidden
    >
      {GOOGLE_LOGO.map(({ id, char, color }) => (
        <span key={id} style={{ color }}>
          {char}
        </span>
      ))}
    </h1>
  )
}

function SearchIcon({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15Z"
        stroke="#9aa0a6"
        strokeWidth="1.8"
      />
      <path d="M16.2 16.2 20 20" stroke="#9aa0a6" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

function MicIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        fill="#4285f4"
        d="M12 14a2.5 2.5 0 0 0 2.5-2.5V6.5A2.5 2.5 0 0 0 12 4a2.5 2.5 0 0 0-2.5 2.5V11.5A2.5 2.5 0 0 0 12 14Zm0-8a1 1 0 0 1 1 1v5a1 1 0 1 1-2 0V7a1 1 0 0 1 1-1Zm5 5.5a.75.75 0 0 1 1.5 0A5.25 5.25 0 0 1 12 18.25 5.25 5.25 0 0 1 5.25 12a.75.75 0 0 1 1.5 0A3.75 3.75 0 0 0 12 16.75 3.75 3.75 0 0 0 15.75 13ZM12 20.25a.75.75 0 0 1 .75.75v1.5a.75.75 0 0 1-1.5 0v-1.5a.75.75 0 0 1 .75-.75Z"
      />
    </svg>
  )
}

function LensIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        fill="#4285f4"
        d="M12 8.25a3.75 3.75 0 1 0 0 7.5 3.75 3.75 0 0 0 0-7.5Zm-5.25 3.75a5.25 5.25 0 1 1 10.5 0 5.25 5.25 0 0 1-10.5 0ZM3 12.75a.75.75 0 0 1 .75-.75h1.5a.75.75 0 0 1 0 1.5h-1.5a.75.75 0 0 1-.75-.75Zm15.75 0a.75.75 0 0 1 .75-.75h1.5a.75.75 0 0 1 0 1.5h-1.5a.75.75 0 0 1-.75-.75ZM12 3a.75.75 0 0 1 .75.75v1.5a.75.75 0 0 1-1.5 0v-1.5A.75.75 0 0 1 12 3Zm0 15.75a.75.75 0 0 1 .75.75v1.5a.75.75 0 0 1-1.5 0v-1.5a.75.75 0 0 1 .75-.75Z"
      />
    </svg>
  )
}

function AppsIcon() {
  return (
    <svg className="h-6 w-6" viewBox="0 0 24 24" fill="#5f6368" aria-hidden>
      <path d="M6 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2Zm0 6c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2Zm0 6c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2Zm6-12c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2Zm0 6c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2Zm0 6c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2Zm6-12c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2Zm0 6c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2Zm0 6c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2Z" />
    </svg>
  )
}

function FakeGoogleHeader() {
  return (
    <header className="flex items-center justify-end gap-1 px-3 py-3.5 sm:gap-2 sm:px-5">
      <button type="button" tabIndex={-1} className={TOP_LINK_CLASS}>
        Gmail
      </button>
      <button type="button" tabIndex={-1} className={TOP_LINK_CLASS}>
        Images
      </button>
      <button
        type="button"
        tabIndex={-1}
        className="rounded-full p-2 transition hover:bg-[#f1f3f4]"
        aria-hidden
      >
        <AppsIcon />
      </button>
      <button
        type="button"
        tabIndex={-1}
        className="ml-1 rounded bg-[#1a73e8] px-4 py-2 text-[13px] font-medium leading-none text-white transition hover:bg-[#1765cc] hover:shadow-sm sm:ml-2"
      >
        Sign in
      </button>
    </header>
  )
}

function FakeGoogleFooter() {
  return (
    <footer className="mt-auto bg-[#f2f2f2] text-[#70757a]">
      <div className="border-b border-[#dadce0] px-6 py-3 text-[15px]">Taiwan</div>
      <div className="flex flex-col gap-3 px-6 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          <span>About</span>
          <span>Advertising</span>
          <span>Business</span>
          <span>How Search works</span>
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          <span>Privacy</span>
          <span>Terms</span>
          <span>Settings</span>
        </div>
      </div>
    </footer>
  )
}

function FakeGoogleNoResults() {
  return (
    <div className="mt-8 w-full max-w-[652px] border-t border-[#ebebeb] pt-5 text-sm text-[#4d5156]">
      <p className="text-[#70757a]">
        About 0 results <span className="text-[#dadce0]">(0.19 seconds)</span>
      </p>
      <p className="mt-4 text-[20px] text-[#202124]">
        Your search did not match any documents.
      </p>
      <p className="mt-4 text-[#70757a]">Suggestions:</p>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-[#70757a]">
        <li>Make sure all words are spelled correctly.</li>
        <li>Try different keywords.</li>
        <li>Try more general keywords.</li>
      </ul>
    </div>
  )
}

export function AccessGate({ children }: { children: ReactNode }) {
  const [authed, setAuthed] = useState(() => isDeviceAuthed())
  const [pin, setPin] = useState('')
  const [error, setError] = useState(false)
  const [busy, setBusy] = useState(false)
  const [focused, setFocused] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    document.title = authed ? APP_TITLE : 'Google'
    const link = document.querySelector<HTMLLinkElement>("link[rel='icon']")
    if (!link) return
    link.href = authed ? APP_FAVICON : GOOGLE_FAVICON
  }, [authed])

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
    window.addEventListener('pev:unauthorized', syncAuth)
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener('pageshow', onPageShow)
      window.removeEventListener('pagehide', onPageHide)
      window.removeEventListener('pev:unauthorized', syncAuth)
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
    if (!pin.trim() || busy) return

    const submitted = pin
    setBusy(true)
    setError(false)
    void loginWithPinAsync(submitted).then((result) => {
      setBusy(false)
      if (result.ok) {
        markDeviceAuthed()
        setPin('')
        setAuthed(true)
        return
      }
      setError(true)
      setPin('')
      inputRef.current?.focus()
    })
  }

  if (authed) {
    return children
  }

  const searchBarShadow = focused
    ? '0 2px 8px 1px rgba(64,60,67,.24)'
    : '0 1px 6px rgba(32,33,36,.28)'

  return (
    <div
      className="flex min-h-dvh flex-col bg-white text-[#202124]"
      style={{ fontFamily: 'arial, sans-serif' }}
    >
      <FakeGoogleHeader />

      <main className="flex flex-1 flex-col items-center px-4 pb-10 pt-6 sm:pt-10">
        <FakeGoogleLogo />

        <form onSubmit={handleSubmit} className="w-full max-w-[584px]">
          <div
            className="flex items-center gap-3 rounded-full border border-transparent bg-white px-4 py-3 transition-[box-shadow,border-color] sm:px-5 sm:py-3.5"
            style={{ boxShadow: searchBarShadow }}
          >
            <SearchIcon className="h-5 w-5 shrink-0" />
            <input
              ref={inputRef}
              type="password"
              inputMode="text"
              autoComplete="off"
              maxLength={16}
              value={pin}
              disabled={busy}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              onChange={(event) => {
                setPin(event.target.value)
                if (error) setError(false)
              }}
              className="min-w-0 flex-1 bg-transparent text-base text-[#202124] outline-none sm:text-[16px]"
              aria-label="Search"
            />
            <div className="flex shrink-0 items-center gap-1 sm:gap-2">
              <button
                type="button"
                tabIndex={-1}
                className="rounded-full p-2 transition hover:bg-[#f1f3f4]"
                aria-hidden
              >
                <MicIcon />
              </button>
              <button
                type="button"
                tabIndex={-1}
                className="rounded-full p-2 transition hover:bg-[#f1f3f4]"
                aria-hidden
              >
                <LensIcon />
              </button>
            </div>
          </div>

          <div className="mt-[26px] flex flex-wrap items-center justify-center gap-[11px]">
            <button
              type="submit"
              className="rounded-[4px] border border-transparent bg-[#f8f9fa] px-4 py-[10px] text-sm text-[#3c4043] transition hover:border-[#dadce0] hover:shadow-sm"
            >
              Google Search
            </button>
            <button
              type="submit"
              className="rounded-[4px] border border-transparent bg-[#f8f9fa] px-4 py-[10px] text-sm text-[#3c4043] transition hover:border-[#dadce0] hover:shadow-sm"
            >
              I&apos;m Feeling Lucky
            </button>
          </div>
        </form>

        <p className="mt-8 text-[13px] text-[#4d5156]">
          <span className="text-[#1a0dab] hover:underline">Google</span>
          {' offered in: '}
          <button type="button" tabIndex={-1} className="text-[#1a0dab] hover:underline">
            繁體中文
          </button>
        </p>

        {error && <FakeGoogleNoResults />}
      </main>

      <FakeGoogleFooter />
    </div>
  )
}
