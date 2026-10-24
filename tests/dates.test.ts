import { describe, expect, it } from 'vitest'
import {
  billingMonthOptions,
  currentMonthKey,
  formatDate,
  formatMonth,
  isISODate,
  isMonthKey,
  nextMonthKey,
  previousMonthKey,
  recentMonthKeys,
  todayISO,
} from '../src/lib/dates'

describe('month keys', () => {
  it('validates', () => {
    expect(isMonthKey('2026-09')).toBe(true)
    expect(isMonthKey('2026-13')).toBe(false)
    expect(isMonthKey('2026-00')).toBe(false)
    expect(isMonthKey('26-09')).toBe(false)
  })

  it('rolls over year boundaries', () => {
    expect(previousMonthKey('2026-01')).toBe('2025-12')
    expect(nextMonthKey('2025-12')).toBe('2026-01')
    expect(previousMonthKey('2026-09')).toBe('2026-08')
    expect(nextMonthKey('2026-09')).toBe('2026-10')
  })

  it('lists recent months newest first', () => {
    expect(recentMonthKeys('2026-01', 3)).toEqual(['2026-01', '2025-12', '2025-11'])
  })

  it('keeps current months selectable when an older month is selected', () => {
    const options = billingMonthOptions('2026-10', '2025-10', 24)
    expect(options[0]).toBe('2026-10')
    expect(options).toContain('2025-10')
    expect(options).toContain('2024-11')
  })

  it('preserves a selected historical month outside the recent range', () => {
    expect(billingMonthOptions('2026-10', '2020-05', 24)).toContain('2020-05')
  })

  it('formats month names', () => {
    expect(formatMonth('2026-09')).toBe('September 2026')
    expect(formatMonth('2026-12')).toBe('December 2026')
    expect(formatMonth('nonsense')).toBe('nonsense')
  })

  it('uses Asia/Kolkata for today and current month', () => {
    const instant = new Date('2026-01-01T18:30:00.000Z') // 00:00 IST on 2 Jan
    expect(todayISO(instant)).toBe('2026-01-02')
    expect(currentMonthKey(instant)).toBe('2026-01')

    const justBeforeIstMidnight = new Date('2026-01-01T18:29:00.000Z') // 23:59 IST on 1 Jan
    expect(todayISO(justBeforeIstMidnight)).toBe('2026-01-01')
  })
})

describe('formatDate / isISODate', () => {
  it('formats dates', () => {
    expect(formatDate('2026-09-05')).toBe('5 Sep 2026')
    expect(formatDate(null)).toBe('')
    expect(formatDate('')).toBe('')
  })

  it('validates dates', () => {
    expect(isISODate('2026-02-28')).toBe(true)
    expect(isISODate('2026-02-29')).toBe(false)
    expect(isISODate('2026-13-01')).toBe(false)
  })
})
