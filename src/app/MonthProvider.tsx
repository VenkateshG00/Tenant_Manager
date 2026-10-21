import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { currentMonthKey, isMonthKey, recentMonthKeys } from '../lib/dates'

interface MonthApi {
  month: string
  setMonth(month: string): void
  months: string[]
}

const MonthContext = createContext<MonthApi | null>(null)

const STORAGE_KEY = 'tenant-app:billing-month'

export function MonthProvider({ children }: { children: ReactNode }) {
  const [month, setMonthState] = useState<string>(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY)
      if (stored && isMonthKey(stored)) return stored
    } catch {
      // storage unavailable — fall through
    }
    return currentMonthKey()
  })

  const setMonth = useCallback((next: string) => {
    if (!isMonthKey(next)) return
    setMonthState(next)
    try {
      window.localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // ignore
    }
  }, [])

  const months = useMemo(() => recentMonthKeys(month, 24), [month])

  const value = useMemo<MonthApi>(() => ({ month, setMonth, months }), [month, setMonth, months])
  return <MonthContext.Provider value={value}>{children}</MonthContext.Provider>
}

export function useMonth(): MonthApi {
  const ctx = useContext(MonthContext)
  if (!ctx) throw new Error('useMonth must be used inside MonthProvider')
  return ctx
}
