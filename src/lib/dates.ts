/**
 * Calendar helpers, always in Asia/Kolkata regardless of the viewer's clock.
 */

export const APP_TIMEZONE = 'Asia/Kolkata'

/** Current billing month key, e.g. "2026-10". */
export function currentMonthKey(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: APP_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
  }).format(now)
}

/** Today's date in Asia/Kolkata as YYYY-MM-DD. */
export function todayISO(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: APP_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

export function isMonthKey(value: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value)
}

/** "2026-09" → "September 2026" */
export function formatMonth(monthKey: string): string {
  if (!isMonthKey(monthKey)) return monthKey
  const [year = '', month = '01'] = monthKey.split('-')
  return `${MONTH_NAMES[Number(month) - 1] ?? ''} ${year}`
}

/** "2026-09" → "Sep 2026" (compact, for tables) */
export function formatMonthShort(monthKey: string): string {
  if (!isMonthKey(monthKey)) return monthKey
  const [year = '', month = '01'] = monthKey.split('-')
  return `${(MONTH_NAMES[Number(month) - 1] ?? '').slice(0, 3)} ${year}`
}

/** Previous calendar month key. */
export function previousMonthKey(monthKey: string): string {
  if (!isMonthKey(monthKey)) throw new Error('Invalid month key')
  const [yearRaw = '0', monthRaw = '01'] = monthKey.split('-')
  const year = Number(yearRaw)
  const month = Number(monthRaw)
  if (month === 1) return `${year - 1}-12`
  return `${year}-${String(month - 1).padStart(2, '0')}`
}

/** Next calendar month key. */
export function nextMonthKey(monthKey: string): string {
  if (!isMonthKey(monthKey)) throw new Error('Invalid month key')
  const [yearRaw = '0', monthRaw = '01'] = monthKey.split('-')
  const year = Number(yearRaw)
  const month = Number(monthRaw)
  if (month === 12) return `${year + 1}-01`
  return `${year}-${String(month + 1).padStart(2, '0')}`
}

/** Last 12 month keys ending at `endMonth` (inclusive), newest first. */
export function recentMonthKeys(endMonth: string, count = 12): string[] {
  const keys: string[] = []
  let cursor = endMonth
  for (let i = 0; i < count; i += 1) {
    keys.push(cursor)
    cursor = previousMonthKey(cursor)
  }
  return keys
}

/** Recent billing months, anchored to today while preserving an older selection. */
export function billingMonthOptions(
  currentMonth: string,
  selectedMonth: string,
  count = 24,
): string[] {
  const keys = recentMonthKeys(currentMonth, count)
  if (!keys.includes(selectedMonth)) keys.push(selectedMonth)
  return keys.sort((a, b) => b.localeCompare(a))
}

/** "2026-09-14" → "14 Sep 2026"; returns "" for empty input. */
export function formatDate(isoDate: string | null | undefined): string {
  if (!isoDate) return ''
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate)
  if (!match) return isoDate
  const month = (MONTH_NAMES[Number(match[2]) - 1] ?? '').slice(0, 3)
  return `${Number(match[3])} ${month} ${match[1]}`
}

/** Validate a YYYY-MM-DD date string. */
export function isISODate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const d = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value
}
