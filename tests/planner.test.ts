import { describe, expect, it } from 'vitest'
import { planElectricityCharges, planPaymentAllocations } from '../src/data/planner'
import { allocateFIFO } from '../src/lib/ledger'
import type { Bill, Charge, Meter, Payment, Tenant } from '../src/data/types'

const tenants: Tenant[] = [
  { id: 't1', name: 'A', roomNumber: '101', phone: null, monthlyRentPaise: 800000, moveInDate: null, isActive: true, notes: null, createdAt: '2026-01-01T00:00:00Z' },
  { id: 't2', name: 'B', roomNumber: '102', phone: null, monthlyRentPaise: 900000, moveInDate: null, isActive: true, notes: null, createdAt: '2026-01-01T00:00:00Z' },
  { id: 't3', name: 'C', roomNumber: '201', phone: null, monthlyRentPaise: 700000, moveInDate: null, isActive: false, notes: null, createdAt: '2026-01-01T00:00:00Z' },
]

function meter(id: string, assignments: Meter['assignments'], arrangement: Meter['arrangement'] = 'individual'): Meter {
  return {
    id,
    meterCode: id.toUpperCase(),
    uscNumber: `USC-${id}`,
    roomLabel: 'X',
    arrangement,
    isActive: true,
    notes: null,
    createdAt: '2026-01-01T00:00:00Z',
    assignments,
  }
}

function bill(overrides: Partial<Bill> = {}): Bill {
  return {
    id: 'bill-1',
    meterId: 'm1',
    billingMonth: '2026-09',
    amountPaise: 10000,
    billGeneratedAt: '2026-09-05',
    dueDate: '2026-09-20',
    billReference: null,
    receiptUrl: null,
    status: 'verified',
    source: 'manual_entry',
    notes: null,
    createdAt: '2026-09-01T00:00:00Z',
    updatedAt: '2026-09-01T00:00:00Z',
    ...overrides,
  }
}

const asg = (tenantId: string, allocationWeight = 1) => ({
  id: `asg-${tenantId}`,
  meterId: 'm1',
  tenantId,
  allocationWeight,
  notes: null,
})

describe('planElectricityCharges', () => {
  it('charges a single tenant in full for an individual meter', () => {
    const planned = planElectricityCharges(bill({ amountPaise: 48000 }), meter('m1', [asg('t1')]), tenants)
    expect(planned).toHaveLength(1)
    expect(planned[0]).toMatchObject({ tenantId: 't1', amountPaise: 48000, period: '2026-09', sourceId: 'bill-1' })
  })

  it('splits a shared meter evenly and exactly', () => {
    const planned = planElectricityCharges(
      bill({ amountPaise: 32000 }),
      meter('m1', [asg('t1'), asg('t2')], 'shared'),
      tenants,
    )
    expect(planned.map((p) => [p.tenantId, p.amountPaise])).toEqual([
      ['t1', 16000],
      ['t2', 16000],
    ])
  })

  it('honours explicit allocation weights', () => {
    const planned = planElectricityCharges(
      bill({ amountPaise: 10000 }),
      meter('m1', [asg('t1', 2), asg('t2', 1)], 'shared'),
      tenants,
    )
    expect(planned.map((p) => [p.tenantId, p.amountPaise])).toEqual([
      ['t1', 6667],
      ['t2', 3333],
    ])
    expect(planned.reduce((a, p) => a + p.amountPaise, 0)).toBe(10000)
  })

  it('produces no charges for a meter with no assignment', () => {
    expect(planElectricityCharges(bill(), meter('m1', []), tenants)).toEqual([])
  })

  it('ignores inactive tenants', () => {
    const planned = planElectricityCharges(
      bill({ amountPaise: 5000 }),
      meter('m1', [asg('t3'), asg('t1')]),
      tenants,
    )
    expect(planned).toHaveLength(1)
    expect(planned[0]?.tenantId).toBe('t1')
  })

  it('produces no charges for a void bill', () => {
    const planned = planElectricityCharges(
      bill({ status: 'void' }),
      meter('m1', [asg('t1')]),
      tenants,
    )
    expect(planned).toEqual([])
  })

  it('falls back to the first of the month when no generation date exists', () => {
    const planned = planElectricityCharges(
      bill({ billGeneratedAt: null, amountPaise: 1000 }),
      meter('m1', [asg('t1')]),
      tenants,
    )
    expect(planned[0]?.chargeDate).toBe('2026-09-01')
  })
})

describe('planPaymentAllocations', () => {
  const charges: Charge[] = [
    { id: 'c1', tenantId: 't1', chargeType: 'rent', period: '2026-08', chargeDate: '2026-08-01', amountPaise: 800000, description: null, sourceId: null, createdAt: '2026-01-01T00:00:00Z' },
    { id: 'c2', tenantId: 't2', chargeType: 'rent', period: '2026-08', chargeDate: '2026-08-01', amountPaise: 900000, description: null, sourceId: null, createdAt: '2026-01-01T00:00:00Z' },
  ]

  it('allocates only against the paying tenant', () => {
    const payment: Payment = {
      id: 'p1', tenantId: 't1', paymentDate: '2026-08-10', amountPaise: 500000,
      method: 'upi', reference: null, notes: null, createdAt: '2026-01-01T00:00:00Z',
    }
    const planned = planPaymentAllocations('t1', payment, charges)
    expect(planned).toEqual([{ chargeId: 'c1', amountPaise: 500000 }])
    // matches the reference FIFO implementation
    expect(allocateFIFO(charges.filter((c) => c.tenantId === 't1'), [payment])).toHaveLength(1)
  })
})
