import type { ReactNode } from 'react'

type Tone = 'slate' | 'green' | 'amber' | 'rose' | 'indigo' | 'sky'

const TONES: Record<Tone, string> = {
  slate: 'bg-slate-100 text-slate-700 ring-slate-200',
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  amber: 'bg-amber-50 text-amber-800 ring-amber-200',
  rose: 'bg-rose-50 text-rose-700 ring-rose-200',
  indigo: 'bg-indigo-50 text-indigo-700 ring-indigo-200',
  sky: 'bg-sky-50 text-sky-700 ring-sky-200',
}

export function Badge({
  tone = 'slate',
  children,
  title,
}: {
  tone?: Tone
  children: ReactNode
  title?: string
}) {
  return (
    <span
      title={title}
      className={[
        'inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset',
        TONES[tone],
      ].join(' ')}
    >
      {children}
    </span>
  )
}
