/** Environment access — only publishable/anon values ever reach the browser. */

export const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL ?? '').trim()
export const SUPABASE_ANON_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY ?? '').trim()

export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY)

/** True when no Supabase project is configured and the UI runs on sample data. */
export const isDemoMode = !isSupabaseConfigured
