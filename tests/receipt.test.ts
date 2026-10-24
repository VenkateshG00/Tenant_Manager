import { describe, expect, it } from 'vitest'
import { formatReceiptNumber } from '../src/lib/receipt'

describe('formatReceiptNumber', () => {
  it('creates a stable readable reference without exposing the full payment ID', () => {
    const paymentId = '6ea585fb-f54c-4a9b-be71-893a49bbe750'

    expect(formatReceiptNumber(paymentId, '2026-10-25')).toBe('RCT-20261025-49BBE750')
    expect(formatReceiptNumber(paymentId, '2026-10-25')).toBe(formatReceiptNumber(paymentId, '2026-10-25'))
  })

  it('rejects invalid payment details', () => {
    expect(() => formatReceiptNumber('', '2026-10-25')).toThrow()
    expect(() => formatReceiptNumber('payment-id', 'invalid')).toThrow()
  })
})
