/**
 * Ledger engine — the single source of truth for balances and statements.
 *
 * Everything here is a pure function over rows, so it is unit-tested and
 * identical in demo mode and Supabase mode.
 *
 * Rules (documented, applied consistently):
 *  - outstanding = Σ charges − Σ payments received up to that month
 *  - payments allocate FIFO to charges: oldest charge first (by charge_date,
 *    then created_at, then id); allocations are kept for the per-charge
 *    breakdown and audit trail
 *  - statements and balances bucket charges by their billing period; charge
 *    dates are used only to order charges within the FIFO allocation
 *  - credit charges carry a negative amount and reduce the balance
 */

import { sumPaise, type Paise } from './money'
import { isMonthKey } from './dates'

export type ChargeType = 'rent' | 'electricity' | 'other' | 'credit'
export type PaymentMethod = 'cash' | 'upi' | 'bank_transfer' | 'cheque' | 'other'

export interface Charge {
  id: string
  tenantId: string
  chargeType: ChargeType
  /** Billing month key, YYYY-MM. */
  period: string
  /** Date the charge is booked on, YYYY-MM-DD. */
  chargeDate: string
  amountPaise: Paise
  description?: string | null
  /** Bill id for electricity charges; null otherwise. */
  sourceId?: string | null
  createdAt: string
}

export interface Payment {
  id: string
  tenantId: string
  paymentDate: string
  amountPaise: Paise
  method: PaymentMethod
  reference?: string | null
  notes?: string | null
  createdAt: string
}

export interface Allocation {
  paymentId: string
  chargeId: string
  amountPaise: Paise
}

export type StatementStatus = 'unpaid' | 'partially_paid' | 'settled' | 'credit'

export interface StatementLine {
  charge: Charge
  billedPaise: Paise
  paidPaise: Paise
  balancePaise: Paise
}

export interface TenantStatement {
  tenantId: string
  period: string
  previousOutstandingPaise: Paise
  rentPaise: Paise
  electricityPaise: Paise
  otherPaise: Paise
  creditPaise: Paise
  totalChargesPaise: Paise
  paymentsReceivedPaise: Paise
  /** All payments received up to the end of the period (any charge they cleared). */
  paymentsToDatePaise: Paise
  /** Portion of those payments allocated to charges billed on or before the period. */
  allocatedPaise: Paise
  /** Payments received by this period but not applied to charges billed by it. */
  advancePaise: Paise
  outstandingPaise: Paise
  status: StatementStatus
  lines: StatementLine[]
  payments: Payment[]
}

const monthOf = (date: string): string => date.slice(0, 7)

function sortCharges(charges: readonly Charge[]): Charge[] {
  return [...charges].sort((a, b) => {
    if (a.chargeDate !== b.chargeDate) return a.chargeDate < b.chargeDate ? -1 : 1
    if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  })
}

function sortPayments(payments: readonly Payment[]): Payment[] {
  return [...payments].sort((a, b) => {
    if (a.paymentDate !== b.paymentDate) return a.paymentDate < b.paymentDate ? -1 : 1
    if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  })
}

/**
 * FIFO allocation of payments to charges: each payment is applied to the
 * oldest charge that still has a balance. Only positive charges receive
 * allocations; credits already reduce the balance on their own.
 */
export function allocateFIFO(charges: readonly Charge[], payments: readonly Payment[]): Allocation[] {
  const chargeList = sortCharges(charges)
    .filter((c) => c.amountPaise > 0)
    .map((c) => ({ id: c.id, remaining: c.amountPaise }))

  const open = chargeList.map((c) => ({ ...c }))
  const allocations: Allocation[] = []

  for (const payment of sortPayments(payments)) {
    let remaining = payment.amountPaise
    for (const charge of open) {
      if (remaining <= 0) break
      if (charge.remaining <= 0) continue
      const take = Math.min(remaining, charge.remaining)
      charge.remaining -= take
      remaining -= take
      allocations.push({ paymentId: payment.id, chargeId: charge.id, amountPaise: take })
    }
    // Any leftover (overpayment) is intentionally unallocated and shows up
    // as a credit on the outstanding balance.
  }

  return allocations
}

export interface BalanceOptions {
  /** Include charges whose month is < beforeMonth (exclusive). */
  beforeMonth?: string
  /** Include charges whose month is <= throughMonth (inclusive). */
  throughMonth?: string
}

/**
 * Net balance as of a month: charges for billed periods through that month
 * minus payments received through that month.
 *
 * Using payments rather than allocations means an overpayment is correctly
 * shown as a credit instead of silently disappearing. Allocations are still
 * kept for the per-charge breakdown and audit trail.
 */
export function computeOutstanding(
  charges: readonly Charge[],
  payments: readonly Payment[],
  options: BalanceOptions = {},
): Paise {
  const { beforeMonth, throughMonth } = options
  let total = 0
  for (const charge of charges) {
    const m = charge.period
    if (beforeMonth !== undefined && !(m < beforeMonth)) continue
    if (throughMonth !== undefined && !(m <= throughMonth)) continue
    total += charge.amountPaise
  }
  for (const payment of payments) {
    const m = monthOf(payment.paymentDate)
    if (beforeMonth !== undefined && !(m < beforeMonth)) continue
    if (throughMonth !== undefined && !(m <= throughMonth)) continue
    total -= payment.amountPaise
  }
  return total
}

/**
 * Build the monthly statement for one tenant.
 * `charges` / `payments` / `allocations` must all belong to that tenant
 * (allocations may reference charges outside the list; those are ignored by
 * the balance maths only when the charge itself is filtered out).
 */
export function computeStatement(
  tenantId: string,
  period: string,
  charges: readonly Charge[],
  payments: readonly Payment[],
  allocations: readonly Allocation[],
): TenantStatement {
  if (!isMonthKey(period)) throw new Error(`Invalid period: ${period}`)

  const tenantCharges = charges.filter((c) => c.tenantId === tenantId)
  const tenantPayments = payments.filter((p) => p.tenantId === tenantId)
  const chargeIdToAmount = new Map(tenantCharges.map((c) => [c.id, c.amountPaise]))
  const paymentDates = new Map(tenantPayments.map((p) => [p.id, p.paymentDate]))

  const paidByCharge = new Map<string, Paise>()
  for (const allocation of allocations) {
    if (!chargeIdToAmount.has(allocation.chargeId)) continue
    const paymentDate = paymentDates.get(allocation.paymentId)
    if (!paymentDate || monthOf(paymentDate) > period) continue
    paidByCharge.set(
      allocation.chargeId,
      (paidByCharge.get(allocation.chargeId) ?? 0) + allocation.amountPaise,
    )
  }

  const isInPeriod = (date: string) => monthOf(date) === period

  const rentPaise = sumPaise(
    tenantCharges.filter((c) => c.period === period && c.chargeType === 'rent').map((c) => c.amountPaise),
  )
  const electricityPaise = sumPaise(
    tenantCharges.filter((c) => c.period === period && c.chargeType === 'electricity').map((c) => c.amountPaise),
  )
  const otherPaise = sumPaise(
    tenantCharges.filter((c) => c.period === period && c.chargeType === 'other').map((c) => c.amountPaise),
  )
  const creditPaise = sumPaise(
    tenantCharges.filter((c) => c.period === period && c.chargeType === 'credit').map((c) => c.amountPaise),
  )

  const totalChargesPaise = rentPaise + electricityPaise + otherPaise + creditPaise
  const previousOutstandingPaise = computeOutstanding(tenantCharges, tenantPayments, {
    beforeMonth: period,
  })
  const outstandingPaise = computeOutstanding(tenantCharges, tenantPayments, {
    throughMonth: period,
  })

  const paymentsReceivedPaise = sumPaise(
    tenantPayments.filter((p) => isInPeriod(p.paymentDate)).map((p) => p.amountPaise),
  )
  const paymentsToDatePaise = sumPaise(
    tenantPayments.filter((p) => monthOf(p.paymentDate) <= period).map((p) => p.amountPaise),
  )
  const allocatedPaise = sumPaise(
    allocations
      .filter((a) => {
        const charge = tenantCharges.find((c) => c.id === a.chargeId)
        if (!charge || charge.period > period) return false
        const paymentDate = paymentDates.get(a.paymentId)
        return paymentDate !== undefined && monthOf(paymentDate) <= period
      })
      .map((a) => a.amountPaise),
  )
  const advancePaise = Math.max(0, paymentsToDatePaise - allocatedPaise)

  const lines: StatementLine[] = sortCharges(
    tenantCharges.filter((c) => c.period <= period),
  ).map((charge) => {
    const paid = paidByCharge.get(charge.id) ?? 0
    return { charge, billedPaise: charge.amountPaise, paidPaise: paid, balancePaise: charge.amountPaise - paid }
  })

  let status: StatementStatus
  if (outstandingPaise < 0) status = 'credit'
  else if (outstandingPaise === 0) status = 'settled'
  else if (allocatedPaise > 0) status = 'partially_paid'
  else status = 'unpaid'

  return {
    tenantId,
    period,
    previousOutstandingPaise,
    rentPaise,
    electricityPaise,
    otherPaise,
    creditPaise,
    totalChargesPaise,
    paymentsReceivedPaise,
    paymentsToDatePaise,
    allocatedPaise,
    advancePaise,
    outstandingPaise,
    status,
    lines,
    payments: sortPayments(tenantPayments.filter((p) => monthOf(p.paymentDate) <= period)).reverse(),
  }
}

/**
 * Split an amount across weights using the largest-remainder method so the
 * parts always sum back to the original amount, exactly.
 * Used for shared-meter electricity allocation.
 */
export function splitAmountByWeights(totalPaise: Paise, weights: readonly number[]): Paise[] {
  if (weights.length === 0) throw new Error('At least one weight is required')
  if (weights.some((w) => !Number.isInteger(w) || w <= 0)) {
    throw new Error('Weights must be positive integers')
  }
  const weightTotal = weights.reduce((a, b) => a + b, 0)
  const sign = totalPaise < 0 ? -1 : 1
  const total = Math.abs(totalPaise)

  const exact = weights.map((w) => (total * w) / weightTotal)
  const floors = exact.map((v) => Math.floor(v))
  let remainder = total - floors.reduce((a, b) => a + b, 0)

  const order = exact
    .map((value, index) => ({ index, frac: value - Math.floor(value) }))
    .sort((a, b) => b.frac - a.frac || a.index - b.index)

  const result = [...floors]
  for (let i = 0; i < remainder; i += 1) {
    const target = order[i % order.length]
    if (!target) break
    result[target.index] = (result[target.index] ?? 0) + 1
  }

  return result.map((v) => v * sign)
}

export interface MonthOverview {
  period: string
  expectedRentPaise: Paise
  electricityChargedPaise: Paise
  otherChargedPaise: Paise
  creditPaise: Paise
  paymentsReceivedPaise: Paise
  previousDuesPaise: Paise
  advancePaise: Paise
  outstandingPaise: Paise
  activeTenantCount: number
  paidCount: number
  partialCount: number
  unpaidCount: number
}

/** Roll up every tenant's statement into one month summary. */
export function computeMonthOverview(
  period: string,
  tenants: readonly { id: string; isActive: boolean }[],
  charges: readonly Charge[],
  payments: readonly Payment[],
  allocations: readonly Allocation[],
): MonthOverview {
  const activeIds = tenants.filter((t) => t.isActive).map((t) => t.id)
  const statements = activeIds.map((id) => computeStatement(id, period, charges, payments, allocations))

  return {
    period,
    expectedRentPaise: sumPaise(statements.map((s) => s.rentPaise)),
    electricityChargedPaise: sumPaise(statements.map((s) => s.electricityPaise)),
    otherChargedPaise: sumPaise(statements.map((s) => s.otherPaise)),
    creditPaise: sumPaise(statements.map((s) => s.creditPaise)),
    paymentsReceivedPaise: sumPaise(statements.map((s) => s.paymentsReceivedPaise)),
    previousDuesPaise: sumPaise(statements.map((s) => s.previousOutstandingPaise)),
    advancePaise: sumPaise(statements.map((s) => s.advancePaise)),
    outstandingPaise: sumPaise(statements.map((s) => s.outstandingPaise)),
    activeTenantCount: activeIds.length,
    paidCount: statements.filter((s) => s.status === 'settled' || s.status === 'credit').length,
    partialCount: statements.filter((s) => s.status === 'partially_paid').length,
    unpaidCount: statements.filter((s) => s.status === 'unpaid').length,
  }
}
