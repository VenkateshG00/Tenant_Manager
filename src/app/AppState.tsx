import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { createClient, type SupabaseClient, type Session } from '@supabase/supabase-js'
import { isSupabaseConfigured, SUPABASE_ANON_KEY, SUPABASE_URL } from './env'
import { DemoStore } from '../data/demo/demoStore'
import { SupabaseStore } from '../data/supabase/supabaseStore'
import type { AppStore } from '../data/store'

export type AuthStatus = 'loading' | 'authenticated' | 'anonymous'

interface AppState {
  store: AppStore
  supabase: SupabaseClient | null
  status: AuthStatus
  email: string | null
  signIn(email: string, password: string): Promise<{ ok: boolean; error?: string }>
  signOut(): Promise<void>
  refresh(): Promise<void>
}

const AppStateContext = createContext<AppState | null>(null)

let cachedClient: SupabaseClient | null = null

function getSupabase(): SupabaseClient | null {
  if (!isSupabaseConfigured) return null
  if (!cachedClient) {
    cachedClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  }
  return cachedClient
}

export function AppStateProvider({ children }: { children: ReactNode }) {
  const supabase = useMemo(() => getSupabase(), [])
  const store = useMemo<AppStore>(
    () => (supabase ? new SupabaseStore(supabase) : new DemoStore()),
    [supabase],
  )

  const [status, setStatus] = useState<AuthStatus>(supabase ? 'loading' : 'authenticated')
  const [email, setEmail] = useState<string | null>(null)

  const applySession = useCallback((session: Session | null) => {
    if (session?.user?.email) {
      setEmail(session.user.email)
      setStatus('authenticated')
    } else {
      setEmail(null)
      setStatus(supabase ? 'anonymous' : 'authenticated')
    }
  }, [supabase])

  useEffect(() => {
    if (!supabase) return
    let cancelled = false
    supabase.auth.getSession().then(({ data }) => {
      if (!cancelled) applySession(data.session ?? null)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      applySession(session)
    })
    return () => {
      cancelled = true
      sub.subscription.unsubscribe()
    }
  }, [supabase, applySession])

  const signIn = useCallback(
    async (inputEmail: string, inputPassword: string) => {
      if (!supabase) return { ok: false, error: 'Supabase is not configured' }
      const { data, error } = await supabase.auth.signInWithPassword({
        email: inputEmail.trim(),
        password: inputPassword,
      })
      if (error) return { ok: false, error: error.message }
      applySession(data.session ?? null)
      return { ok: true }
    },
    [supabase, applySession],
  )

  const signOut = useCallback(async () => {
    if (supabase) await supabase.auth.signOut()
    applySession(null)
  }, [supabase, applySession])

  const refresh = useCallback(async () => {
    if (!supabase) return
    const { data } = await supabase.auth.getSession()
    applySession(data.session ?? null)
  }, [supabase, applySession])

  const value = useMemo<AppState>(
    () => ({ store, supabase, status, email, signIn, signOut, refresh }),
    [store, supabase, status, email, signIn, signOut, refresh],
  )

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>
}

export function useAppState(): AppState {
  const ctx = useContext(AppStateContext)
  if (!ctx) throw new Error('useAppState must be used inside AppStateProvider')
  return ctx
}

export function useStore(): AppStore {
  return useAppState().store
}
