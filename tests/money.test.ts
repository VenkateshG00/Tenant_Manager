import { describe, expect, it } from 'vitest'
import { formatINR, paiseToDecimalString, paiseToInputValue, sumPaise, toPaise } from '../src/lib/money'

describe('toPaise', () => {
  it('parses decimal rupee strings exactly', () => {
    expect(toPaise('0')).toBe(0)
    expect(toPaise('1')).toBe(100)
    expect(toPaise('1.5')).toBe(150)
    expect(toPaise('1.05')).toBe(105)
    expect(toPaise('1234.56')).toBe(123456)
    expect(toPaise('₹1,234.56')).toBe(123456)
  })

  it('never uses floating point for two-decimal amounts', () => {
    // 0.1 + 0.2 style trap
    expect(toPaise('0.1') + toPaise('0.2')).toBe(30)
    expect(toPaise('8.07')).toBe(807)
    expect(toPaise('1.10')).toBe(110)
    expect(toPaise('1.00')).toBe(100)
  })

  it('parses numbers', () => {
    expect(toPaise(85)).toBe(8500)
    expect(toPaise(0.1)).toBe(10)
  })

  it('rejects malformed input', () => {
    expect(() => toPaise('')).toThrow()
    expect(() => toPaise('abc')).toThrow()
    expect(() => toPaise('1.234')).toThrow()
    expect(() => toPaise('1,2,3.45.6')).toThrow()
  })
})

describe('paiseToDecimalString / paiseToInputValue', () => {
  it('round-trips', () => {
    expect(paiseToDecimalString(123456)).toBe('1234.56')
    expect(paiseToDecimalString(5)).toBe('0.05')
    expect(paiseToDecimalString(0)).toBe('0.00')
    expect(paiseToInputValue(null)).toBe('')
    expect(toPaise(paiseToDecimalString(999999))).toBe(999999)
  })
})

describe('formatINR', () => {
  it('formats with Indian digit grouping', () => {
    expect(formatINR(0)).toContain('0.00')
    expect(formatINR(100000)).toContain('1,000.00')
    expect(formatINR(10000000)).toContain('1,00,000.00')
    expect(formatINR(-5000)).toBe('-₹50.00')
  })
})

describe('sumPaise', () => {
  it('sums integers exactly', () => {
    expect(sumPaise([1, 2, 3])).toBe(6)
    expect(sumPaise([])).toBe(0)
    expect(sumPaise([807, 105])).toBe(912)
  })
})
