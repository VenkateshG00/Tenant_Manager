import { describe, expect, it } from 'vitest'
import { overdueBills, unusualBillChanges } from '../src/lib/bill-alerts'
import type { Bill } from '../src/data/types'

function bill(overrides: Partial<Bill> = {}): Bill {
  return {
    id: 'bill-current',
    meterId: 'meter-1',
    billingMonth: '2026-10',
    amountPaise: 30_000,
    billGeneratedAt: null,
    dueDate: '2026-10-20',
    billReference: null,
    receiptUrl: null,
    status: 'verified',
    source: 'manual_entry',
    notes: null,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('bill alerts', () => {
  it('flags unpaid bills past their due date but excludes paid, void, and future-due bills', () => {
    const bills = [
      bill({ id: 'overdue', dueDate: '2026-10-19' }),
      bill({ id: 'paid', dueDate: '2026-10-19', status: 'paid' }),
      bill({ id: 'void', dueDate: '2026-10-19', status: 'void' }),
      bill({ id: 'future', dueDate: '2026-10-21' }),
      bill({ id: 'no-date', dueDate: null }),
    ]
    expect(overdueBills(bills, '2026-10-20').map((item) => item.id)).toEqual(['overdue'])
  })

  it('flags bill changes of at least 50% and ₹100 against the latest prior bill', () => {
    const bills = [
      bill({ id: 'older', billingMonth: '2026-08', amountPaise: 10_000 }),
      bill({ id: 'previous', billingMonth: '2026-09', amountPaise: 20_000 }),
      bill({ id: 'current', amountPaise: 30_000 }),
    ]
    expect(unusualBillChanges(bills, '2026-10')).toEqual([
      expect.objectContaining({
        bill: bills[2],
        previousBill: bills[1],
        changePercent: 50,
        direction: 'increase',
      }),
    ])
  })

  it('ignores small changes, bills without a previous amount, and void comparisons', () => {
    const bills = [
      bill({ id: 'baseline', billingMonth: '2026-09', amountPaise: 20_000 }),
      bill({ id: 'small-change', amountPaise: 29_999 }),
      bill({ id: 'void-prior', billingMonth: '2026-08', amountPaise: 1_000_000, status: 'void' }),
    ]
    expect(unusualBillChanges(bills, '2026-10')).toEqual([])
  })
})
