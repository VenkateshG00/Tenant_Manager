import { useId } from 'react'
import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react'

interface FieldShellProps {
  id: string
  label: string
  error?: string | null
  hint?: string | null
  required?: boolean
  children: ReactNode
}

export function Field({ id, label, error, hint, required, children }: FieldShellProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-semibold text-slate-700">
        {label}
        {required && <span className="ml-0.5 text-rose-600" aria-hidden="true">*</span>}
        {required && <span className="sr-only"> (required)</span>}
      </label>
      {children}
      {hint && !error && <p className="text-xs text-slate-500">{hint}</p>}
      {error && (
        <p className="text-xs font-medium text-rose-600" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}

const CONTROL =
  'w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 shadow-sm ' +
  'placeholder:text-slate-400 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 ' +
  'disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500'

interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> {
  label: string
  error?: string | null
  hint?: string | null
}

export function Input({ label, error, hint, required, className = '', ...rest }: InputProps) {
  const id = useId()
  return (
    <Field id={id} label={label} error={error} hint={hint} required={required}>
      <input
        id={id}
        required={required}
        aria-invalid={error ? true : undefined}
        className={[CONTROL, className].join(' ')}
        {...rest}
      />
    </Field>
  )
}

interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'id'> {
  label: string
  error?: string | null
  hint?: string | null
  children: ReactNode
}

export function Select({ label, error, hint, required, className = '', children, ...rest }: SelectProps) {
  const id = useId()
  return (
    <Field id={id} label={label} error={error} hint={hint} required={required}>
      <select
        id={id}
        required={required}
        aria-invalid={error ? true : undefined}
        className={[CONTROL, className].join(' ')}
        {...rest}
      >
        {children}
      </select>
    </Field>
  )
}

interface TextareaProps extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'id'> {
  label: string
  error?: string | null
  hint?: string | null
}

export function Textarea({ label, error, hint, required, className = '', ...rest }: TextareaProps) {
  const id = useId()
  return (
    <Field id={id} label={label} error={error} hint={hint} required={required}>
      <textarea
        id={id}
        required={required}
        aria-invalid={error ? true : undefined}
        className={[CONTROL, 'min-h-[80px] resize-y', className].join(' ')}
        {...rest}
      />
    </Field>
  )
}
