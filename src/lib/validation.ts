import { toPaise } from './money'
import { isISODate, isMonthKey } from './dates'
import { normalizeIndianPhone } from './phone'

export type FieldErrors<T extends string> = Partial<Record<T, string>>

export function required(value: string | null | undefined, label: string): string | null {
  if (!value || value.trim() === '') return `${label} is required`
  return null
}

/** Validate a rupee amount from a text input; returns paise or an error. */
export function parseRupees(
  value: string,
  label: string,
  options: { allowZero?: boolean; min?: number } = {},
): { ok: true; paise: number } | { ok: false; error: string } {
  const trimmed = value.trim().replace(/[,₹\s]/g, '')
  if (trimmed === '') return { ok: false, error: `${label} is required` }
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) {
    return { ok: false, error: `${label} must be a positive amount (max 2 decimals)` }
  }
  let paise: number
  try {
    paise = toPaisesSafe(trimmed)
  } catch {
    return { ok: false, error: `${label} is not a valid amount` }
  }
  if (!options.allowZero && paise <= 0) return { ok: false, error: `${label} must be greater than zero` }
  if (options.allowZero && paise < 0) return { ok: false, error: `${label} cannot be negative` }
  return { ok: true, paise }
}

function toPaisesSafe(value: string): number {
  return toPaise(value)
}

export function validatePhone(value: string): string | null {
  if (!value || value.trim() === '') return null // phone is optional
  const result = normalizeIndianPhone(value)
  return result.ok ? null : result.reason
}

export function validateMonthKey(value: string, label = 'Billing month'): string | null {
  if (!value) return `${label} is required`
  return isMonthKey(value) ? null : `${label} must be in YYYY-MM format`
}

export function validateDate(value: string | null | undefined, label: string, optional = false): string | null {
  if (!value || value.trim() === '') return optional ? null : `${label} is required`
  return isISODate(value) ? null : `${label} must be a valid date (YYYY-MM-DD)`
}

export function validateWeight(value: string): string | null {
  const n = Number(value)
  if (!Number.isInteger(n) || n <= 0) return 'Weight must be a positive whole number'
  return null
}

export function combineErrors<T extends string>(errors: FieldErrors<T>): string | null {
  const list = Object.values(errors).filter((e): e is string => Boolean(e))
  return list.length > 0 ? list.join(' · ') : null
}
