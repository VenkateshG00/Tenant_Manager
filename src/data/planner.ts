/**
 * Pure planning helpers shared by the demo store and the Supabase store, so
 * the charge/allocations produced by a write are identical in both modes and
 * unit-testable.
 */

import { splitAmountByWeights, allocateFIFO, type Charge, type Payment } from '../lib/ledger'
import type { Bill, ChargeInput, Meter, Tenant } from './types'

/**
 * Turn a verified bill into per-tenant electricity charges using each
 * meter-tenant assignment's allocation weight. A meter with no assignments
 * produces no charges and the UI surfaces it as an unmapped meter.
 */
export function planElectricityCharges(bill: Bill, meter: Meter, tenants: Tenant[]): ChargeInput[] {
  if (bill.status === 'void') return []
  if (meter.assignments.length === 0) return []

  const activeIds = new Set(tenants.filter((t) => t.isActive).map((t) => t.id))
  const assignments = meter.assignments.filter((a) => activeIds.has(a.tenantId))
  if (assignments.length === 0) return []

  const weights = assignments.map((a) => a.allocationWeight)
  const parts = splitAmountByWeights(bill.amountPaise, weights)

  return assignments.map((assignment, index) => ({
    tenantId: assignment.tenantId,
    chargeType: 'electricity' as const,
    period: bill.billingMonth,
    chargeDate: bill.billGeneratedAt ?? `${bill.billingMonth}-01`,
    amountPaise: parts[index] ?? 0,
    description: `Electricity ${meter.meterCode} (USC ${meter.uscNumber}) · ${bill.billingMonth}`,
    sourceId: bill.id,
  }))
}

export interface PlannedAllocation {
  chargeId: string
  amountPaise: number
}

/** FIFO allocation for a payment, as the store should persist it. */
export function planPaymentAllocations(
  tenantId: string,
  payment: Payment,
  charges: readonly Charge[],
): PlannedAllocation[] {
  const tenantCharges = charges.filter((c) => c.tenantId === tenantId)
  return allocateFIFO(tenantCharges, [payment]).map((a) => ({
    chargeId: a.chargeId,
    amountPaise: a.amountPaise,
  }))
}
