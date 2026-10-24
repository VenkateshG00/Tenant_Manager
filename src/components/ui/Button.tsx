import type { ButtonHTMLAttributes, ReactNode } from 'react'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'sm' | 'md'

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-gradient-to-b from-indigo-600 to-indigo-700 text-white shadow-sm shadow-indigo-900/15 hover:from-indigo-500 hover:to-indigo-600 disabled:cursor-not-allowed disabled:opacity-50',
  secondary:
    'bg-white text-slate-700 ring-1 ring-slate-200 shadow-sm hover:bg-slate-50 hover:ring-slate-300 disabled:cursor-not-allowed disabled:opacity-50',
  ghost:
    'bg-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-950 disabled:opacity-50',
  danger:
    'bg-gradient-to-b from-rose-600 to-rose-700 text-white shadow-sm shadow-rose-900/10 hover:from-rose-500 hover:to-rose-600 disabled:cursor-not-allowed disabled:opacity-50',
}

const SIZES: Record<Size, string> = {
  sm: 'px-2.5 py-1.5 text-xs',
  md: 'px-4 py-2.5 text-sm',
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  busy?: boolean
  children: ReactNode
}

export function Button({
  variant = 'secondary',
  size = 'md',
  busy = false,
  className = '',
  children,
  disabled,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      className={[
        'inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition duration-150 active:translate-y-px',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2',
        VARIANTS[variant],
        SIZES[size],
        className,
      ].join(' ')}
      {...rest}
    >
      {busy && (
        <span
          className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent"
          aria-hidden="true"
        />
      )}
      {children}
    </button>
  )
}
