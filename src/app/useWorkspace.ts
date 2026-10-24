import { createContext, createElement, useContext, useMemo } from 'react'
import type { ReactNode } from 'react'
import { useStore } from './AppState'
import { useAsync } from './hooks'
import { useMonth } from './MonthProvider'
import {
  computeStatement,
  type MonthOverview,
  type TenantStatement,
} from '../lib/ledger'
import { sumPaise } from '../lib/money'
import type {
  Allocation, Bill, Charge, Meter, Payment, ReminderLog, Tenant,
} from '../data/types'

export interface Workspace {
  tenants: Tenant[]
  meters: Meter[]
  bills: Bill[]
  charges: Charge[]
  payments: Payment[]
  allocations: Allocation[]
  statements: TenantStatement[]
  statementsByTenant: Map<string, TenantStatement>
  overview: MonthOverview
  loading: boolean
  error: string | null
  reload(): void
}

interface WorkspaceData {
  data: Pick<Workspace, 'tenants' | 'meters' | 'bills' | 'charges' | 'payments' | 'allocations'> | null
  loading: boolean
  error: string | null
  reload(): void
}

const WorkspaceDataContext = createContext<WorkspaceData | null>(null)

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const store = useStore()
  const state = useAsync(async () => {
    const [tenants, meters, bills, charges, payments, allocations] = await Promise.all([
      store.listTenants(),
      store.listMeters(),
      store.listBills(),
      store.listCharges(),
      store.listPayments(),
      store.listAllocations(),
    ])
    return { tenants, meters, bills, charges, payments, allocations }
  }, [store])

  const value = useMemo<WorkspaceData>(
    () => ({ data: state.data, loading: state.loading, error: state.error, reload: state.reload }),
    [state.data, state.loading, state.error, state.reload],
  )

  return createElement(WorkspaceDataContext.Provider, { value }, children)
}

/**
 * Loads every ledger row once and derives statements + the month overview.
 * The demo store and the Supabase store both feed this, so the maths is
 * identical in both modes.
 */
export function useWorkspace(): Workspace {
  const shared = useContext(WorkspaceDataContext)
  if (!shared) throw new Error('useWorkspace must be used inside WorkspaceProvider')
  const { month } = useMonth()

  const derived = useMemo(() => {
    const data = shared.data
    if (!data) {
      return {
        tenants: [] as Tenant[],
        meters: [] as Meter[],
        bills: [] as Bill[],
        charges: [] as Charge[],
        payments: [] as Payment[],
        allocations: [] as Allocation[],
        statements: [] as TenantStatement[],
        statementsByTenant: new Map<string, TenantStatement>(),
        overview: {
          period: month,
          expectedRentPaise: 0,
          electricityChargedPaise: 0,
          otherChargedPaise: 0,
          creditPaise: 0,
          paymentsReceivedPaise: 0,
          previousDuesPaise: 0,
          outstandingPaise: 0,
          activeTenantCount: 0,
          paidCount: 0,
          partialCount: 0,
          unpaidCount: 0,
        } satisfies MonthOverview,
      }
    }
    const { tenants, meters, charges, allocations } = data
    const bills = [...data.bills].sort(
      (a, b) => b.billingMonth.localeCompare(a.billingMonth) || b.createdAt.localeCompare(a.createdAt),
    )
    const payments = [...data.payments].sort(
      (a, b) => b.paymentDate.localeCompare(a.paymentDate) || b.createdAt.localeCompare(a.createdAt),
    )
    const statements = tenants
      .filter((t) => t.isActive)
      .map((t) => computeStatement(t.id, month, charges, payments, allocations))
    const overview: MonthOverview = {
      period: month,
      expectedRentPaise: sumPaise(statements.map((s) => s.rentPaise)),
      electricityChargedPaise: sumPaise(statements.map((s) => s.electricityPaise)),
      otherChargedPaise: sumPaise(statements.map((s) => s.otherPaise)),
      creditPaise: sumPaise(statements.map((s) => s.creditPaise)),
      paymentsReceivedPaise: sumPaise(statements.map((s) => s.paymentsReceivedPaise)),
      previousDuesPaise: sumPaise(statements.map((s) => s.previousOutstandingPaise)),
      outstandingPaise: sumPaise(statements.map((s) => s.outstandingPaise)),
      activeTenantCount: statements.length,
      paidCount: statements.filter((s) => s.status === 'settled' || s.status === 'credit').length,
      partialCount: statements.filter((s) => s.status === 'partially_paid').length,
      unpaidCount: statements.filter((s) => s.status === 'unpaid').length,
    }
    return {
      tenants,
      meters,
      bills,
      charges,
      payments,
      allocations,
      statements,
      statementsByTenant: new Map(statements.map((s) => [s.tenantId, s])),
      overview,
    }
  }, [shared.data, month])

  return useMemo<Workspace>(
    () => ({
      ...derived,
      loading: shared.loading,
      error: shared.error,
      reload: shared.reload,
    }),
    [derived, shared.loading, shared.error, shared.reload],
  )
}

/** Month overview used by the dashboard cards. */
export function useMonthOverview(workspace: Workspace) {
  return workspace.overview
}

/** Convenience: latest reminder log per tenant for a period. */
export function latestRemindersByTenant(logs: ReminderLog[]): Map<string, ReminderLog> {
  const map = new Map<string, ReminderLog>()
  for (const log of logs) {
    if (!map.has(log.tenantId)) map.set(log.tenantId, log)
  }
  return map
}
