import { describe, expect, it } from 'vitest'
import { isValidIndianPhone, normalizeIndianPhone } from '../src/lib/phone'

describe('normalizeIndianPhone', () => {
  it('accepts a plain 10-digit number', () => {
    const result = normalizeIndianPhone('9876543210')
    expect(result).toEqual({ ok: true, e164Digits: '919876543210', display: '+91 98765 43210' })
  })

  it('accepts common formatting', () => {
    for (const input of ['+91 98765 43210', '09876543210', '91-98765-43210', '98765 43210']) {
      const result = normalizeIndianPhone(input)
      expect(result.ok).toBe(true)
      if (result.ok) expect(result.e164Digits).toBe('919876543210')
    }
  })

  it('rejects invalid numbers', () => {
    expect(normalizeIndianPhone('').ok).toBe(false)
    expect(normalizeIndianPhone('12345').ok).toBe(false)
    expect(normalizeIndianPhone('5876543210').ok).toBe(false) // must start 6-9
    expect(normalizeIndianPhone('9876543210123456').ok).toBe(false)
    expect(normalizeIndianPhone('abcdefghij').ok).toBe(false)
  })

  it('exposes a boolean helper', () => {
    expect(isValidIndianPhone('9876543210')).toBe(true)
    expect(isValidIndianPhone('98765')).toBe(false)
  })
})
