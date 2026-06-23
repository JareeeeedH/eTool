import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { isDeviceAuthed, markDeviceAuthed, verifyAccessPin } from '../auth/deviceAccess'

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

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (verifyAccessPin(pin)) {
      markDeviceAuthed()
      setError('')
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
            inputMode="numeric"
            autoComplete="off"
            maxLength={8}
            value={pin}
            onChange={(event) => {
              setPin(event.target.value)
              if (error) setError('')
            }}
            className="min-w-0 flex-1 rounded border border-slate-300 px-3 py-2 text-center text-sm tracking-[0.3em] text-slate-800 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-500/20"
            aria-label="驗證碼"
          />
          <button
            type="submit"
            className="shrink-0 rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-500/30"
          >
            OK
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
