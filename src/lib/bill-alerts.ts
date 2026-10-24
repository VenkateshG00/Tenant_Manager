import type { Bill } from '../data/types'

export interface BillChangeAlert {
  bill: Bill
  previousBill: Bill
  changePercent: number
  direction: 'increase' | 'decrease'
}

const MIN_CHANGE_PAISE = 10_000
const MIN_CHANGE_PERCENT = 50

export function overdueBills(bills: readonly Bill[], today: string): Bill[] {
  return bills.filter(
    (bill) =>
      bill.status !== 'paid' &&
      bill.status !== 'void' &&
      bill.dueDate !== null &&
      bill.dueDate < today,
  )
}

export function unusualBillChanges(
  bills: readonly Bill[],
  billingMonth: string,
): BillChangeAlert[] {
  const activeBills = bills.filter((bill) => bill.status !== 'void')
  return activeBills
    .filter((bill) => bill.billingMonth === billingMonth && bill.amountPaise > 0)
    .flatMap((bill) => {
      const previousBill = activeBills
        .filter(
          (candidate) =>
            candidate.meterId === bill.meterId &&
            candidate.billingMonth < bill.billingMonth &&
            candidate.amountPaise > 0,
        )
        .sort((a, b) => b.billingMonth.localeCompare(a.billingMonth))[0]
      if (!previousBill) return []

      const difference = bill.amountPaise - previousBill.amountPaise
      const changePercent = Math.round((Math.abs(difference) / previousBill.amountPaise) * 100)
      if (
        Math.abs(difference) < MIN_CHANGE_PAISE ||
        changePercent < MIN_CHANGE_PERCENT
      ) {
        return []
      }
      return [{
        bill,
        previousBill,
        changePercent,
        direction: difference > 0 ? 'increase' as const : 'decrease' as const,
      }]
    })
}
