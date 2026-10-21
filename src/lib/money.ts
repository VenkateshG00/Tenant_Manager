/**
 * Exact money handling for INR.
 *
 * Every rupee amount in this app is carried around as an integer number of
 * paise. Floating point is never used for financial totals; `numeric(14,2)`
 * in Postgres is the exact equivalent.
 */

export type Paise = number

/** Parse a decimal rupee amount (number or string) into integer paise. */
export function toPaise(value: number | string): Paise {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Invalid amount')
    return Math.round(value * 100)
  }
  const trimmed = value.trim().replace(/[,₹\s]/g, '')
  if (trimmed === '') throw new Error('Invalid amount')
  if (!/^-?\d*(\.\d*)?$/.test(trimmed)) throw new Error('Invalid amount')
  const negative = trimmed.startsWith('-')
  const unsigned = negative ? trimmed.slice(1) : trimmed
  const [whole = '0', fraction = ''] = unsigned.split('.')
  if (fraction.length > 2) throw new Error('Amount cannot have more than 2 decimal places')
  const padded = (fraction + '00').slice(0, 2)
  const paise = Number(whole || '0') * 100 + Number(padded)
  if (!Number.isSafeInteger(paise)) throw new Error('Amount out of range')
  return negative ? -paise : paise
}

/** Render integer paise as a plain decimal rupee string, e.g. "1234.50". */
export function paiseToDecimalString(paise: Paise): string {
  const negative = paise < 0
  const abs = Math.abs(paise)
  const whole = Math.floor(abs / 100)
  const fraction = String(abs % 100).padStart(2, '0')
  return `${negative ? '-' : ''}${whole}.${fraction}`
}

/** Decimal rupee string usable in a `<input type="number">`. */
export function paiseToInputValue(paise: Paise | null | undefined): string {
  if (paise === null || paise === undefined || Number.isNaN(paise)) return ''
  return paiseToDecimalString(paise)
}

const inrFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const inrFormatterWhole = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
})

/** Format integer paise as ₹1,234.56 (Indian digit grouping). */
export function formatINR(paise: Paise, options?: { whole?: boolean }): string {
  const rupees = paise / 100
  return options?.whole ? inrFormatterWhole.format(rupees) : inrFormatter.format(rupees)
}

/** Sum paise values exactly (all integers). */
export function sumPaise(values: readonly Paise[]): Paise {
  let total = 0
  for (const v of values) {
    total += v
    if (!Number.isSafeInteger(total)) throw new Error('Money sum overflow')
  }
  return total
}
