import { useMemo } from 'react'
import { useStore } from './AppState'
import { useAsync } from './hooks'
import { useMonth } from './MonthProvider'
import {
  computeMonthOverview,
  computeStatement,
  type TenantStatement,
} from '../lib/ledger'
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
  loading: boolean
  error: string | null
  reload(): void
}

/**
 * Loads every ledger row once and derives statements + the month overview.
 * The demo store and the Supabase store both feed this, so the maths is
 * identical in both modes.
 */
export function useWorkspace(): Workspace {
  const store = useStore()
  const { month } = useMonth()

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

  const derived = useMemo(() => {
    const data = state.data
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
      }
    }
    const { tenants, meters, bills, charges, payments, allocations } = data
    const statements = tenants
      .filter((t) => t.isActive)
      .map((t) => computeStatement(t.id, month, charges, payments, allocations))
    return {
      tenants,
      meters,
      bills,
      charges,
      payments,
      allocations,
      statements,
      statementsByTenant: new Map(statements.map((s) => [s.tenantId, s])),
    }
  }, [state.data, month])

  return useMemo<Workspace>(
    () => ({
      ...derived,
      loading: state.loading,
      error: state.error,
      reload: state.reload,
    }),
    [derived, state.loading, state.error, state.reload],
  )
}

/** Month overview used by the dashboard cards. */
export function useMonthOverview(workspace: Workspace) {
  const { month } = useMonth()
  return useMemo(
    () =>
      computeMonthOverview(
        month,
        workspace.tenants.map((t) => ({ id: t.id, isActive: t.isActive })),
        workspace.charges,
        workspace.payments,
        workspace.allocations,
      ),
    [month, workspace.tenants, workspace.charges, workspace.payments, workspace.allocations],
  )
}

/** Convenience: latest reminder log per tenant for a period. */
export function latestRemindersByTenant(logs: ReminderLog[]): Map<string, ReminderLog> {
  const map = new Map<string, ReminderLog>()
  for (const log of logs) {
    if (!map.has(log.tenantId)) map.set(log.tenantId, log)
  }
  return map
}
