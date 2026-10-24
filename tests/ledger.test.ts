import { describe, expect, it } from 'vitest'
import {
  allocateFIFO,
  computeMonthOverview,
  computeOutstanding,
  computeStatement,
  splitAmountByWeights,
  type Charge,
  type Payment,
} from '../src/lib/ledger'

let seq = 0
function charge(partial: Partial<Charge> & Pick<Charge, 'tenantId' | 'chargeType' | 'period' | 'amountPaise'>): Charge {
  seq += 1
  return {
    id: partial.id ?? `c${seq}`,
    chargeDate: partial.chargeDate ?? `${partial.period}-01`,
    description: partial.description ?? null,
    sourceId: partial.sourceId ?? null,
    createdAt: partial.createdAt ?? `2026-01-01T00:00:00.000Z.${String(seq).padStart(6, '0')}`,
    ...partial,
  } as Charge
}

function payment(partial: Partial<Payment> & Pick<Payment, 'tenantId' | 'paymentDate' | 'amountPaise'>): Payment {
  seq += 1
  return {
    id: partial.id ?? `p${seq}`,
    method: partial.method ?? 'upi',
    reference: partial.reference ?? null,
    notes: partial.notes ?? null,
    createdAt: partial.createdAt ?? `2026-01-02T00:00:00.000Z.${String(seq).padStart(6, '0')}`,
    ...partial,
  } as Payment
}

describe('allocateFIFO', () => {
  it('applies a payment to the oldest charge first', () => {
    const charges = [
      charge({ id: 'old', tenantId: 't1', chargeType: 'rent', period: '2026-07', amountPaise: 800000, chargeDate: '2026-07-01' }),
      charge({ id: 'new', tenantId: 't1', chargeType: 'rent', period: '2026-08', amountPaise: 800000, chargeDate: '2026-08-01' }),
    ]
    const payments = [payment({ id: 'pay', tenantId: 't1', paymentDate: '2026-08-10', amountPaise: 500000 })]

    const allocations = allocateFIFO(charges, payments)
    expect(allocations).toHaveLength(1)
    expect(allocations[0]).toMatchObject({ paymentId: 'pay', chargeId: 'old', amountPaise: 500000 })
  })

  it('spreads one payment across several charges and leaves the rest open', () => {
    const charges = [
      charge({ id: 'c1', tenantId: 't1', chargeType: 'rent', period: '2026-07', amountPaise: 100000 }),
      charge({ id: 'c2', tenantId: 't1', chargeType: 'electricity', period: '2026-07', amountPaise: 50000, chargeDate: '2026-07-05' }),
    ]
    const payments = [payment({ tenantId: 't1', paymentDate: '2026-07-10', amountPaise: 120000 })]

    const allocations = allocateFIFO(charges, payments)
    expect(allocations.map((a) => [a.chargeId, a.amountPaise])).toEqual([
      ['c1', 100000],
      ['c2', 20000],
    ])
  })

  it('keeps overpayment as an unallocated credit (no negative allocation)', () => {
    const charges = [charge({ tenantId: 't1', chargeType: 'rent', period: '2026-07', amountPaise: 10000 })]
    const payments = [payment({ tenantId: 't1', paymentDate: '2026-07-10', amountPaise: 25000 })]
    const allocations = allocateFIFO(charges, payments)
    expect(allocations).toHaveLength(1)
    expect(allocations[0]?.amountPaise).toBe(10000)
    // the extra 15000 is not lost: the net balance is a credit
    expect(computeOutstanding(charges, payments, { throughMonth: '2026-07' })).toBe(-15000)
  })

  it('ignores credit charges when allocating', () => {
    const charges = [
      charge({ id: 'credit', tenantId: 't1', chargeType: 'credit', period: '2026-06', amountPaise: -20000, chargeDate: '2026-06-15' }),
      charge({ id: 'rent', tenantId: 't1', chargeType: 'rent', period: '2026-06', amountPaise: 100000 }),
    ]
    const payments = [payment({ tenantId: 't1', paymentDate: '2026-06-20', amountPaise: 100000 })]
    const allocations = allocateFIFO(charges, payments)
    expect(allocations).toHaveLength(1)
    expect(allocations[0]?.chargeId).toBe('rent')
    // credit still reduces the outstanding balance
    expect(computeOutstanding(charges, payments, { throughMonth: '2026-06' })).toBe(-20000)
  })
})

describe('computeStatement', () => {
  const charges: Charge[] = [
    // July rent, paid in full
    charge({ id: 'jul-rent', tenantId: 't1', chargeType: 'rent', period: '2026-07', amountPaise: 800000, chargeDate: '2026-07-01' }),
    // August rent + electricity, partially paid
    charge({ id: 'aug-rent', tenantId: 't1', chargeType: 'rent', period: '2026-08', amountPaise: 800000, chargeDate: '2026-08-01' }),
    charge({ id: 'aug-elec', tenantId: 't1', chargeType: 'electricity', period: '2026-08', amountPaise: 45000, chargeDate: '2026-08-05' }),
    charge({ id: 'aug-other', tenantId: 't1', chargeType: 'other', period: '2026-08', amountPaise: 10000, chargeDate: '2026-08-06' }),
  ]
  const payments: Payment[] = [
    payment({ id: 'pay-jul', tenantId: 't1', paymentDate: '2026-07-10', amountPaise: 800000 }),
    payment({ id: 'pay-aug', tenantId: 't1', paymentDate: '2026-08-12', amountPaise: 300000 }),
  ]
  const allocations = allocateFIFO(charges, payments)

  it('carries prior dues forward without double-counting', () => {
    const july = computeStatement('t1', '2026-07', charges, payments, allocations)
    expect(july.previousOutstandingPaise).toBe(0)
    expect(july.rentPaise).toBe(800000)
    expect(july.outstandingPaise).toBe(0)
    expect(july.status).toBe('settled')

    const august = computeStatement('t1', '2026-08', charges, payments, allocations)
    // previous month is fully settled → previous dues are zero
    expect(august.previousOutstandingPaise).toBe(0)
    expect(august.rentPaise).toBe(800000)
    expect(august.electricityPaise).toBe(45000)
    expect(august.otherPaise).toBe(10000)
    expect(august.totalChargesPaise).toBe(855000)
    // payments received during August
    expect(august.paymentsReceivedPaise).toBe(300000)
    // 855000 − 300000 allocated
    expect(august.outstandingPaise).toBe(555000)
    expect(august.status).toBe('partially_paid')
  })

  it('shows unpaid when nothing has been paid against the balance', () => {
    const onlyAugust = charges.filter((c) => c.period === '2026-08')
    const statement = computeStatement('t1', '2026-08', onlyAugust, [], [])
    expect(statement.previousOutstandingPaise).toBe(0)
    expect(statement.outstandingPaise).toBe(855000)
    expect(statement.status).toBe('unpaid')
  })

  it('reports zero outstanding and paid status when fully paid', () => {
    const fullPayment = payments.concat(
      payment({ id: 'pay-rest', tenantId: 't1', paymentDate: '2026-08-20', amountPaise: 555000 }),
    )
    const allocs = allocateFIFO(charges, fullPayment)
    const august = computeStatement('t1', '2026-08', charges, fullPayment, allocs)
    expect(august.outstandingPaise).toBe(0)
    expect(august.status).toBe('settled')
    expect(august.paymentsReceivedPaise).toBe(855000)
  })

  it('uses the billing period when a bill is generated in the following month', () => {
    const lateBillCharge = charge({
      id: 'sep-electricity',
      tenantId: 't1',
      chargeType: 'electricity',
      period: '2026-09',
      chargeDate: '2026-10-03',
      amountPaise: 12000,
    })
    const octoberPayment = payment({
      id: 'oct-payment',
      tenantId: 't1',
      paymentDate: '2026-10-10',
      amountPaise: 5000,
    })
    const charges = [lateBillCharge]
    const payments = [octoberPayment]
    const allocations = allocateFIFO(charges, payments)

    const september = computeStatement('t1', '2026-09', charges, payments, allocations)
    expect(september.electricityPaise).toBe(12000)
    expect(september.outstandingPaise).toBe(12000)
    expect(september.lines.map((line) => line.charge.id)).toEqual(['sep-electricity'])
    const septemberOverview = computeMonthOverview(
      '2026-09',
      [{ id: 't1', isActive: true }],
      charges,
      payments,
      allocations,
    )
    expect(septemberOverview.electricityChargedPaise).toBe(12000)
    expect(septemberOverview.outstandingPaise).toBe(12000)

    const october = computeStatement('t1', '2026-10', charges, payments, allocations)
    expect(october.previousOutstandingPaise).toBe(12000)
    expect(october.electricityPaise).toBe(0)
    expect(october.outstandingPaise).toBe(7000)
    expect(october.allocatedPaise).toBe(5000)
    expect(october.lines[0]).toMatchObject({ paidPaise: 5000, balancePaise: 7000 })
  })

  it('applies a new month payment to old dues before the new rent', () => {
    // A September statement where the August balance is cleared in September.
    const september = charges.concat(
      charge({ id: 'sep-rent', tenantId: 't1', chargeType: 'rent', period: '2026-09', amountPaise: 800000, chargeDate: '2026-09-01' }),
    )
    const allPayments = payments.concat(
      payment({ id: 'pay-sep', tenantId: 't1', paymentDate: '2026-09-05', amountPaise: 855000 }),
    )
    const allocs = allocateFIFO(september, allPayments)
    const statement = computeStatement('t1', '2026-09', september, allPayments, allocs)

    // August ended with 555000 still due; the September payment clears it first.
    expect(statement.previousOutstandingPaise).toBe(555000)
    expect(statement.rentPaise).toBe(800000)
    expect(statement.paymentsReceivedPaise).toBe(855000)
    // 555000 + 800000 − 855000 = 500000 (the September rent remains)
    expect(statement.outstandingPaise).toBe(500000)
    // and 1955000 of payments had been applied to charges dated on or before September
    expect(statement.allocatedPaise).toBe(1955000)
  })

  it('isolates tenants from each other', () => {
    const otherTenant = charge({ id: 't2-rent', tenantId: 't2', chargeType: 'rent', period: '2026-08', amountPaise: 900000 })
    const statement = computeStatement('t1', '2026-08', charges.concat(otherTenant), payments, allocations)
    expect(statement.rentPaise).toBe(800000)
    expect(statement.outstandingPaise).toBe(555000)
  })

  it('marks credit balances', () => {
    const credit = charge({ id: 'disc', tenantId: 't1', chargeType: 'credit', period: '2026-08', amountPaise: -900000, chargeDate: '2026-08-07' })
    const all = charges.concat(credit)
    const allocs = allocateFIFO(all, payments)
    const statement = computeStatement('t1', '2026-08', all, payments, allocs)
    expect(statement.outstandingPaise).toBeLessThan(0)
    expect(statement.status).toBe('credit')
  })

  it('rejects invalid periods', () => {
    expect(() => computeStatement('t1', '2026-13', charges, payments, allocations)).toThrow()
  })

  it('keeps future payments out of an earlier month statement', () => {
    const febCharge = charge({
      id: 'feb-rent',
      tenantId: 't1',
      chargeType: 'rent',
      period: '2026-02',
      chargeDate: '2026-02-01',
      amountPaise: 10000,
    })
    const febPayment = payment({
      id: 'feb-payment',
      tenantId: 't1',
      paymentDate: '2026-02-28',
      amountPaise: 5000,
    })
    const marchPayment = payment({
      id: 'march-payment',
      tenantId: 't1',
      paymentDate: '2026-03-01',
      amountPaise: 5000,
    })
    const allocations = [
      { paymentId: febPayment.id, chargeId: febCharge.id, amountPaise: 5000 },
      { paymentId: marchPayment.id, chargeId: febCharge.id, amountPaise: 5000 },
    ]

    const february = computeStatement('t1', '2026-02', [febCharge], [febPayment, marchPayment], allocations)
    expect(february.allocatedPaise).toBe(5000)
    expect(february.lines[0]?.paidPaise).toBe(5000)
    expect(february.lines[0]?.balancePaise).toBe(5000)
    expect(february.payments.map((p) => p.id)).toEqual(['feb-payment'])

    const march = computeStatement('t1', '2026-03', [febCharge], [febPayment, marchPayment], allocations)
    expect(march.allocatedPaise).toBe(10000)
    expect(march.lines[0]?.balancePaise).toBe(0)
  })
})

describe('splitAmountByWeights', () => {
  it('splits equally and exactly', () => {
    expect(splitAmountByWeights(10000, [1, 1])).toEqual([5000, 5000])
  })

  it('uses largest remainder so the parts always sum to the total', () => {
    expect(splitAmountByWeights(10000, [2, 1])).toEqual([6667, 3333])
    expect(splitAmountByWeights(100, [1, 1, 1])).toEqual([34, 33, 33])
    const parts = splitAmountByWeights(99999, [3, 5, 7])
    expect(parts.reduce((a, b) => a + b, 0)).toBe(99999)
  })

  it('handles a single tenant', () => {
    expect(splitAmountByWeights(48000, [1])).toEqual([48000])
  })

  it('rejects bad weights', () => {
    expect(() => splitAmountByWeights(100, [])).toThrow()
    expect(() => splitAmountByWeights(100, [0, 1])).toThrow()
    expect(() => splitAmountByWeights(100, [1.5, 1])).toThrow()
  })
})

describe('computeMonthOverview', () => {
  it('rolls up every active tenant', () => {
    const charges = [
      charge({ id: 'a-rent', tenantId: 'a', chargeType: 'rent', period: '2026-08', amountPaise: 800000 }),
      charge({ id: 'b-rent', tenantId: 'b', chargeType: 'rent', period: '2026-08', amountPaise: 900000 }),
      charge({ id: 'b-elec', tenantId: 'b', chargeType: 'electricity', period: '2026-08', amountPaise: 42000, chargeDate: '2026-08-05' }),
    ]
    const payments = [payment({ id: 'b-pay', tenantId: 'b', paymentDate: '2026-08-10', amountPaise: 900000 })]
    // allocations are always planned per tenant, exactly as the stores do
    const allocations = [
      ...allocateFIFO(charges.filter((c) => c.tenantId === 'a'), payments.filter((p) => p.tenantId === 'a')),
      ...allocateFIFO(charges.filter((c) => c.tenantId === 'b'), payments.filter((p) => p.tenantId === 'b')),
    ]
    const overview = computeMonthOverview(
      '2026-08',
      [
        { id: 'a', isActive: true },
        { id: 'b', isActive: true },
        { id: 'c', isActive: false },
      ],
      charges,
      payments,
      allocations,
    )

    expect(overview.expectedRentPaise).toBe(1700000)
    expect(overview.electricityChargedPaise).toBe(42000)
    expect(overview.paymentsReceivedPaise).toBe(900000)
    expect(overview.activeTenantCount).toBe(2)
    // a: unpaid 800000 · b: 900000+42000−900000 = 42000 left
    expect(overview.outstandingPaise).toBe(842000)
    expect(overview.unpaidCount).toBe(1)
    expect(overview.partialCount).toBe(1)
    expect(overview.paidCount).toBe(0)
  })
})
