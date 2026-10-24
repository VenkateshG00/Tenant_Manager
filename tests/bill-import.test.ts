import { describe, expect, it } from 'vitest'
import { parseBillImportHash } from '../src/lib/bill-import'
import { lookupUrlWithUsc } from '../src/lib/bill-provider'

function importHash(value: unknown) {
  return `#tenant-manager-bill=${encodeURIComponent(JSON.stringify(value))}`
}

describe('TGNPDCL bill import handoff', () => {
  it('accepts valid provider details without saving them', () => {
    expect(
      parseBillImportHash(
        importHash({
          version: 1,
          uscNumber: '15952909',
          amount: '198.50',
          billingMonth: '2026-10',
          billGeneratedAt: '2026-10-03',
          dueDate: '2026-10-19',
          billReference: 'BILL-123',
        }),
      ),
    ).toEqual({
      version: 1,
      uscNumber: '15952909',
      amount: '198.50',
      billingMonth: '2026-10',
      billGeneratedAt: '2026-10-03',
      dueDate: '2026-10-19',
      billReference: 'BILL-123',
    })
  })

  it('rejects malformed, oversized, or invalid field values', () => {
    expect(parseBillImportHash('#tenant-manager-bill=%7B')).toBeNull()
    expect(parseBillImportHash(`#tenant-manager-bill=${'a'.repeat(2049)}`)).toBeNull()
    expect(
      parseBillImportHash(
        importHash({
          version: 1,
          uscNumber: '15952909',
          amount: '1e6',
          billingMonth: '2026-13',
          billGeneratedAt: '2026-02-30',
          dueDate: null,
          billReference: null,
        }),
      ),
    ).toBeNull()
  })

  it('ignores unrelated URL fragments', () => {
    expect(parseBillImportHash('#tenant-manager-usc=15952909')).toBeNull()
  })

  it('passes the selected USC to the desktop helper without sending it to the provider server', () => {
    expect(lookupUrlWithUsc('15952909')).toBe(
      'https://tgnpdcl.com/Menu/KnowYourBillLT#tenant-manager-usc=15952909',
    )
  })
})
