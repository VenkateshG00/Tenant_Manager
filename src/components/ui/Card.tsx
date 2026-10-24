import type { ReactNode } from 'react'

export function Card({
  children,
  className = '',
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div
      className={[
        'rounded-2xl border border-slate-200/80 bg-white shadow-[0_10px_35px_-28px_rgba(15,23,42,0.42)]',
        className,
      ].join(' ')}
    >
      {children}
    </div>
  )
}

export function CardHeader({
  title,
  subtitle,
  actions,
}: {
  title: ReactNode
  subtitle?: ReactNode
  actions?: ReactNode
}) {
  return (
    <div className="flex flex-col gap-3 border-b border-slate-100 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
      <div>
        <h2 className="text-base font-bold tracking-tight text-slate-950">{title}</h2>
        {subtitle && <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string
  description?: ReactNode
  actions?: ReactNode
}) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">{title}</h1>
        {description && <p className="mt-1.5 max-w-2xl text-sm leading-6 text-slate-500">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

export function StatCard({
  label,
  value,
  hint,
  tone = 'neutral',
}: {
  label: string
  value: ReactNode
  hint?: ReactNode
  tone?: 'neutral' | 'positive' | 'warning' | 'danger'
}) {
  const tones = {
    neutral: 'text-slate-900',
    positive: 'text-emerald-700',
    warning: 'text-amber-700',
    danger: 'text-rose-700',
  } as const
  const accents = {
    neutral: 'before:bg-indigo-500',
    positive: 'before:bg-emerald-500',
    warning: 'before:bg-amber-500',
    danger: 'before:bg-rose-500',
  } as const
  return (
    <Card
      className={[
        'relative overflow-hidden p-4 before:absolute before:inset-x-0 before:top-0 before:h-1',
        accents[tone],
      ].join(' ')}
    >
      <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">{label}</p>
      <p className={['num mt-2 text-xl font-bold tracking-tight sm:text-2xl', tones[tone]].join(' ')}>
        {value}
      </p>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </Card>
  )
}
