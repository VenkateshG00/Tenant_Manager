import type { ReactNode } from 'react'
import { Button } from './Button'

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-8 text-sm text-slate-500" role="status">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-indigo-600" />
      <span>{label}…</span>
    </div>
  )
}

export function LoadingBlock({ label }: { label?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <Spinner label={label} />
    </div>
  )
}

export function EmptyState({
  title,
  description,
  action,
  icon,
}: {
  title: string
  description?: ReactNode
  action?: ReactNode
  icon?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-4 py-10 text-center">
      {icon && <div className="text-3xl" aria-hidden="true">{icon}</div>}
      <p className="text-sm font-medium text-slate-700">{title}</p>
      {description && <p className="max-w-md text-sm text-slate-500">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}

export function ErrorState({
  message,
  onRetry,
}: {
  message: string
  onRetry?: () => void
}) {
  return (
    <div
      className="flex flex-col items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 sm:flex-row sm:items-center sm:justify-between"
      role="alert"
    >
      <div>
        <p className="text-sm font-semibold text-rose-800">Something went wrong</p>
        <p className="mt-0.5 text-sm text-rose-700">{message}</p>
      </div>
      {onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  )
}

export function InlineNotice({
  tone = 'info',
  title,
  children,
}: {
  tone?: 'info' | 'warning' | 'danger' | 'success'
  title?: string
  children: ReactNode
}) {
  const tones = {
    info: 'border-sky-200 bg-sky-50 text-sky-900',
    warning: 'border-amber-200 bg-amber-50 text-amber-900',
    danger: 'border-rose-200 bg-rose-50 text-rose-900',
    success: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  } as const
  return (
    <div className={['rounded-lg border p-3 text-sm', tones[tone]].join(' ')} role="note">
      {title && <p className="font-semibold">{title}</p>}
      <div className={title ? 'mt-1 space-y-1' : 'space-y-1'}>{children}</div>
    </div>
  )
}
