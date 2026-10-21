import { useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { useAppState } from '../app/AppState'
import { isDemoMode } from '../app/env'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Field'
import { InlineNotice } from '../components/ui/States'

export function LoginPage() {
  const { status, signIn } = useAppState()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (status === 'authenticated') return <Navigate to="/" replace />

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    const result = await signIn(email, password)
    setBusy(false)
    if (!result.ok) setError(result.error ?? 'Sign-in failed')
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <h1 className="text-lg font-semibold text-slate-900">Sign in</h1>
        <p className="mt-1 text-sm text-slate-500">
          Administrator access only. Accounts are managed in Supabase Auth.
        </p>

        {isDemoMode && (
          <div className="mt-4">
            <InlineNotice tone="warning" title="Supabase is not configured">
              Add <code className="rounded bg-amber-100 px-1">VITE_SUPABASE_URL</code> and{' '}
              <code className="rounded bg-amber-100 px-1">VITE_SUPABASE_ANON_KEY</code> to a{' '}
              <code className="rounded bg-amber-100 px-1">.env.local</code> file to enable sign-in.
              See the README for setup steps.
            </InlineNotice>
          </div>
        )}

        <form className="mt-5 space-y-4" onSubmit={(e) => void onSubmit(e)}>
          <Input
            label="Email"
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Input
            label="Password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {error && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800" role="alert">
              {error}
            </div>
          )}
          <Button type="submit" variant="primary" busy={busy} className="w-full">
            Sign in
          </Button>
        </form>
      </div>
    </div>
  )
}
