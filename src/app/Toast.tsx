import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import type { ReactNode } from 'react'

export type ToastTone = 'success' | 'error' | 'info'

export interface ToastItem {
  id: number
  tone: ToastTone
  message: string
}

interface ToastApi {
  push(message: string, tone?: ToastTone): void
  success(message: string): void
  error(message: string): void
}

const ToastContext = createContext<ToastApi | null>(null)

let nextId = 1

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])

  const remove = useCallback((id: number) => {
    setItems((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const push = useCallback(
    (message: string, tone: ToastTone = 'info') => {
      const id = nextId++
      setItems((prev) => [...prev, { id, tone, message }])
      window.setTimeout(() => remove(id), 6000)
    },
    [remove],
  )

  const api = useMemo<ToastApi>(
    () => ({
      push,
      success: (m: string) => push(m, 'success'),
      error: (m: string) => push(m, 'error'),
    }),
    [push],
  )

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-3 bottom-3 z-50 flex flex-col items-center gap-2 sm:inset-x-auto sm:right-4 sm:bottom-4 sm:items-end"
        role="status"
        aria-live="polite"
      >
        {items.map((item) => (
          <div
            key={item.id}
            className={[
              'pointer-events-auto max-w-sm rounded-lg px-4 py-3 text-sm shadow-lg ring-1',
              item.tone === 'success' && 'bg-emerald-50 text-emerald-900 ring-emerald-200',
              item.tone === 'error' && 'bg-rose-50 text-rose-900 ring-rose-200',
              item.tone === 'info' && 'bg-white text-slate-800 ring-slate-200',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            <div className="flex items-start gap-3">
              <p className="flex-1">{item.message}</p>
              <button
                type="button"
                onClick={() => remove(item.id)}
                className="-m-1 rounded p-1 text-slate-400 hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
                aria-label="Dismiss notification"
              >
                ✕
              </button>
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used inside ToastProvider')
  return ctx
}
