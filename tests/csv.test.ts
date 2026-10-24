import { describe, expect, it } from 'vitest'
import { toCsv } from '../src/lib/csv'

describe('CSV export', () => {
  it('quotes and escapes cells containing commas, quotes, and newlines', () => {
    expect(toCsv([
      ['Tenant', 'Notes'],
      ['Sudha', 'Called, then said "paid"\nnext day'],
    ])).toBe('"Tenant","Notes"\r\n"Sudha","Called, then said ""paid""\nnext day"')
  })

  it('neutralizes formula-like text while leaving numeric amounts numeric', () => {
    expect(toCsv([
      ['Name', 'Amount'],
      ['=HYPERLINK("https://example.com")', -1250],
    ])).toBe('"Name","Amount"\r\n"\'=HYPERLINK(""https://example.com"")","-1250"')
  })

  it('keeps negative decimal values numeric but escapes formula-like negative text', () => {
    expect(toCsv([['Credit', 'Untrusted'], ['-10.25', '-cmd|/C calc']])).toBe(
      '"Credit","Untrusted"\r\n"-10.25","\'-cmd|/C calc"',
    )
  })
})
