import { Link, useNavigate } from 'react-router-dom'
import { useMonth } from '../app/MonthProvider'
import { useMonthOverview, useWorkspace } from '../app/useWorkspace'
import { MonthSelect } from '../components/ui/MonthSelect'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Card, CardHeader, PageHeader, StatCard } from '../components/ui/Card'
import { EmptyState, ErrorState, LoadingBlock } from '../components/ui/States'
import { TableWrap, Td, Th, Tr } from '../components/ui/Table'
import { formatINR } from '../lib/money'
import { formatDate, formatMonth } from '../lib/dates'
import type { StatementStatus } from '../lib/ledger'

const STATUS_TONE: Record<StatementStatus, 'green' | 'amber' | 'rose' | 'sky'> = {
  settled: 'green',
  credit: 'sky',
  partially_paid: 'amber',
  unpaid: 'rose',
}

const STATUS_LABEL: Record<StatementStatus, string> = {
  settled: 'Paid',
  credit: 'In credit',
  partially_paid: 'Partly paid',
  unpaid: 'Unpaid',
}

export function DashboardPage() {
  const { month } = useMonth()
  const workspace = useWorkspace()
  const overview = useMonthOverview(workspace)
  const navigate = useNavigate()

  if (workspace.loading) return <LoadingBlock label="Loading dashboard" />
  if (workspace.error) {
    return <ErrorState message={workspace.error} onRetry={workspace.reload} />
  }

  const outstandingTenants = workspace.statements
    .filter((s) => s.outstandingPaise > 0)
    .sort((a, b) => b.outstandingPaise - a.outstandingPaise)

  const recentBills = workspace.bills.slice(0, 6)
  const recentPayments = workspace.payments.slice(0, 6)
  const activeMeters = workspace.meters.filter((m) => m.isActive)
  const unmapped = activeMeters.filter((m) => m.assignments.length === 0)

  const meterFor = (meterId: string) =>
    workspace.meters.find((m) => m.id === meterId)?.meterCode ?? '—'

  return (
    <>
      <PageHeader
        title={`Dashboard · ${formatMonth(month)}`}
        description="Rent, electricity, payments and outstanding dues for the selected billing month."
        actions={<MonthSelect />}
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Rent expected"
          value={formatINR(overview.expectedRentPaise)}
          hint={`${overview.activeTenantCount} active tenant${overview.activeTenantCount === 1 ? '' : 's'}`}
        />
        <StatCard
          label="Electricity charged"
          value={formatINR(overview.electricityChargedPaise)}
          hint={`${activeMeters.length} active meter${activeMeters.length === 1 ? '' : 's'}`}
        />
        <StatCard
          label="Payments received"
          value={formatINR(overview.paymentsReceivedPaise)}
          tone="positive"
          hint="Recorded during this month"
        />
        <StatCard
          label="Total outstanding"
          value={formatINR(overview.outstandingPaise)}
          tone={overview.outstandingPaise > 0 ? 'danger' : 'positive'}
          hint={`Includes ${formatINR(overview.previousDuesPaise)} carried forward`}
        />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Paid" value={overview.paidCount} tone="positive" />
        <StatCard label="Partly paid" value={overview.partialCount} tone="warning" />
        <StatCard label="Unpaid" value={overview.unpaidCount} tone={overview.unpaidCount > 0 ? 'danger' : 'neutral'} />
        <StatCard label="Other charges" value={formatINR(overview.otherChargedPaise)} />
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        <Button variant="primary" onClick={() => navigate('/bills?new=1')}>
          + Add bill
        </Button>
        <Button variant="primary" onClick={() => navigate('/payments?new=1')}>
          Record payment
        </Button>
        <Button variant="primary" onClick={() => navigate('/statements')}>
          Prepare WhatsApp reminder
        </Button>
        <Button variant="secondary" onClick={() => workspace.reload()}>
          Refresh data
        </Button>
      </div>

      {unmapped.length > 0 && (
        <div className="mt-4">
          <Card className="border-amber-200 bg-amber-50 p-4">
            <p className="text-sm font-semibold text-amber-900">
              {unmapped.length} active meter{unmapped.length === 1 ? ' has' : 's have'} no tenant mapping
            </p>
            <p className="mt-1 text-sm text-amber-800">
              Bills for {unmapped.map((m) => m.meterCode).join(', ')} cannot be allocated to anyone
              until an assignment is saved.
            </p>
            <Link to="/meters" className="mt-2 inline-block text-sm font-medium text-amber-900 underline">
              Open meter management
            </Link>
          </Card>
        </div>
      )}

      <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader
            title="Unpaid & partly paid statements"
            subtitle={`Balances including carried-forward dues for ${formatMonth(month)}`}
            actions={
              <Link to="/statements" className="text-sm font-medium text-indigo-600 hover:underline">
                View all statements
              </Link>
            }
          />
          {outstandingTenants.length === 0 ? (
            <EmptyState
              title="Everything is settled"
              description="No tenant has an outstanding balance for this month."
              icon="✓"
            />
          ) : (
            <TableWrap>
              <thead>
                <Tr>
                  <Th>Tenant</Th>
                  <Th>Room</Th>
                  <Th align="right">Outstanding</Th>
                  <Th>Status</Th>
                </Tr>
              </thead>
              <tbody>
                {outstandingTenants.map((statement) => {
                  const tenant = workspace.tenants.find((t) => t.id === statement.tenantId)
                  return (
                    <Tr key={statement.tenantId}>
                      <Td className="font-medium text-slate-900">{tenant?.name ?? '—'}</Td>
                      <Td>{tenant?.roomNumber ?? '—'}</Td>
                      <Td align="right" className="num font-semibold text-rose-700">
                        {formatINR(statement.outstandingPaise)}
                      </Td>
                      <Td>
                        <Badge tone={STATUS_TONE[statement.status]}>
                          {STATUS_LABEL[statement.status]}
                        </Badge>
                      </Td>
                    </Tr>
                  )
                })}
              </tbody>
            </TableWrap>
          )}
        </Card>

        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader
              title="Recent bills"
              actions={
                <Link to="/bills" className="text-sm font-medium text-indigo-600 hover:underline">
                  All bills
                </Link>
              }
            />
            {recentBills.length === 0 ? (
              <EmptyState title="No bills recorded yet" description="Add the first electricity bill." />
            ) : (
              <ul className="divide-y divide-slate-100">
                {recentBills.map((bill) => (
                  <li key={bill.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                    <div>
                      <p className="font-medium text-slate-900">
                        {meterFor(bill.meterId)} · {formatMonth(bill.billingMonth)}
                      </p>
                      <p className="text-xs text-slate-500">
                        {formatDate(bill.billGeneratedAt) || 'No generation date'} ·{' '}
                        {bill.status.replace('_', ' ')}
                        {!bill.hasCharges && bill.status === 'verified' && ' · charges not applied'}
                      </p>
                    </div>
                    <span className="num font-semibold text-slate-900">{formatINR(bill.amountPaise)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader
              title="Recent payments"
              actions={
                <Link to="/payments" className="text-sm font-medium text-indigo-600 hover:underline">
                  All payments
                </Link>
              }
            />
            {recentPayments.length === 0 ? (
              <EmptyState title="No payments recorded yet" />
            ) : (
              <ul className="divide-y divide-slate-100">
                {recentPayments.map((payment) => {
                  const tenant = workspace.tenants.find((t) => t.id === payment.tenantId)
                  return (
                    <li key={payment.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                      <div>
                        <p className="font-medium text-slate-900">{tenant?.name ?? '—'}</p>
                        <p className="text-xs text-slate-500">
                          {formatDate(payment.paymentDate)} · {payment.method.replace('_', ' ')}
                        </p>
                      </div>
                      <span className="num font-semibold text-emerald-700">
                        {formatINR(payment.amountPaise)}
                      </span>
                    </li>
                  )
                })}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  )
}
