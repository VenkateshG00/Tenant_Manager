import { useMemo, useState } from 'react'
import { useStore } from '../app/AppState'
import { useMonth } from '../app/MonthProvider'
import { useToast } from '../app/Toast'
import { useWorkspace } from '../app/useWorkspace'
import { ReminderPanel } from '../components/ReminderPanel'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Card, PageHeader, StatCard } from '../components/ui/Card'
import { MonthSelect } from '../components/ui/MonthSelect'
import { EmptyState, ErrorState, InlineNotice, LoadingBlock } from '../components/ui/States'
import { TableWrap, Td, Th, Tr } from '../components/ui/Table'
import { formatDate, formatMonth } from '../lib/dates'
import { formatINR, paiseToDecimalString } from '../lib/money'
import { downloadCsv } from '../lib/csv'
import type { StatementStatus } from '../lib/ledger'

const STATUS_TONE: Record<StatementStatus, 'green' | 'sky' | 'amber' | 'rose'> = {
  settled: 'green',
  credit: 'sky',
  partially_paid: 'amber',
  unpaid: 'rose',
}

const STATUS_LABEL: Record<StatementStatus, string> = {
  settled: 'Fully paid',
  credit: 'In credit',
  partially_paid: 'Partly paid',
  unpaid: 'Unpaid',
}

export function StatementsPage() {
  const store = useStore()
  const toast = useToast()
  const { month } = useMonth()
  const workspace = useWorkspace()
  const [expanded, setExpanded] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | 'outstanding' | 'settled'>('all')

  const visible = useMemo(() => {
    if (filter === 'outstanding') {
      return workspace.statements.filter((s) => s.outstandingPaise > 0)
    }
    if (filter === 'settled') {
      return workspace.statements.filter((s) => s.outstandingPaise <= 0)
    }
    return workspace.statements
  }, [workspace.statements, filter])

  if (workspace.loading) return <LoadingBlock label="Loading statements" />
  if (workspace.error) return <ErrorState message={workspace.error} onRetry={workspace.reload} />

  const unmappedBills = workspace.bills.filter(
    (b) => b.billingMonth === month && b.status === 'verified' && !b.hasCharges,
  )

  const totals = {
    rent: workspace.statements.reduce((a, s) => a + s.rentPaise, 0),
    electricity: workspace.statements.reduce((a, s) => a + s.electricityPaise, 0),
    outstanding: workspace.statements.reduce((a, s) => a + s.outstandingPaise, 0),
  }

  return (
    <>
      <PageHeader
        title={`Monthly statements · ${formatMonth(month)}`}
        description="One statement per active tenant: rent, electricity, previous dues, payments and the amount still outstanding."
        actions={
          <>
            <MonthSelect />
            <Button
              variant="secondary"
              onClick={workspace.reload}
            >
              Recalculate
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                const tenantById = new Map(workspace.tenants.map((tenant) => [tenant.id, tenant]))
                downloadCsv(`statements-${month}.csv`, [
                  ['Month', 'Tenant', 'Room', 'Previous dues (INR)', 'Rent (INR)', 'Electricity (INR)', 'Other (INR)', 'Credits (INR)', 'Payments received (INR)', 'Advance / credit (INR)', 'Outstanding (INR)', 'Status'],
                  ...workspace.statements.map((statement) => {
                    const tenant = tenantById.get(statement.tenantId)
                    return [
                      month,
                      tenant?.name ?? '',
                      tenant?.roomNumber ?? '',
                      paiseToDecimalString(statement.previousOutstandingPaise),
                      paiseToDecimalString(statement.rentPaise),
                      paiseToDecimalString(statement.electricityPaise),
                      paiseToDecimalString(statement.otherPaise),
                      paiseToDecimalString(statement.creditPaise),
                      paiseToDecimalString(statement.paymentsReceivedPaise),
                      paiseToDecimalString(statement.advancePaise),
                      paiseToDecimalString(statement.outstandingPaise),
                      statement.status,
                    ]
                  }),
                ])
              }}
            >
              Export CSV
            </Button>
            <Button variant="secondary" onClick={() => window.print()}>
              Print / Save PDF
            </Button>
          </>
        }
      />

      <section id="print-report" className="hidden" aria-hidden="true">
        <h1>Monthly statements — {formatMonth(month)}</h1>
        <table>
          <thead>
            <tr>
              <th>Tenant</th><th>Room</th><th>Previous dues</th><th>Rent</th>
              <th>Electricity</th><th>Other</th><th>Credits</th><th>Payments</th><th>Advance / credit</th><th>Outstanding</th>
            </tr>
          </thead>
          <tbody>
            {workspace.statements.map((statement) => {
              const tenant = workspace.tenants.find((item) => item.id === statement.tenantId)
              return (
                <tr key={statement.tenantId}>
                  <td>{tenant?.name ?? '—'}</td>
                  <td>{tenant?.roomNumber ?? '—'}</td>
                  <td>{formatINR(statement.previousOutstandingPaise)}</td>
                  <td>{formatINR(statement.rentPaise)}</td>
                  <td>{formatINR(statement.electricityPaise)}</td>
                  <td>{formatINR(statement.otherPaise)}</td>
                  <td>{formatINR(statement.creditPaise)}</td>
                  <td>{formatINR(statement.paymentsReceivedPaise)}</td>
                  <td>{formatINR(statement.advancePaise)}</td>
                  <td>{formatINR(statement.outstandingPaise)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </section>

      {unmappedBills.length > 0 && (
        <div className="mb-4">
          <InlineNotice tone="warning" title="Verified bills without charges">
            {unmappedBills.length} verified bill
            {unmappedBills.length === 1 ? ' has' : 's have'} not been applied to tenants yet.
            Electricity totals below may be understated.{' '}
            <button
              type="button"
              className="font-semibold underline"
              onClick={() => {
                void (async () => {
                  let applied = 0
                  const failures: string[] = []
                  for (const bill of unmappedBills) {
                    try {
                      applied += await store.applyBill(bill.id)
                    } catch (error) {
                      failures.push(error instanceof Error ? error.message : String(error))
                    }
                  }
                  if (applied > 0) {
                    toast.success(`Created ${applied} electricity charge${applied === 1 ? '' : 's'}`)
                    workspace.reload()
                  }
                  if (failures.length > 0) {
                    toast.error(`${failures.length} bill${failures.length === 1 ? '' : 's'} could not be applied: ${failures.join('; ')}`)
                  } else if (applied === 0) {
                    toast.success('No new electricity charges were needed')
                  }
                })()
              }}
            >
              Apply them now
            </button>
          </InlineNotice>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard label="Rent billed" value={formatINR(totals.rent)} />
        <StatCard label="Electricity billed" value={formatINR(totals.electricity)} />
        <StatCard
          label="Still outstanding"
          value={formatINR(totals.outstanding)}
          tone={totals.outstanding > 0 ? 'danger' : 'positive'}
        />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-slate-600">Show</span>
        {(
          [
            ['all', 'All tenants'],
            ['outstanding', 'With balance'],
            ['settled', 'Settled'],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setFilter(value)}
            className={[
              'rounded-full px-3 py-1 text-sm font-medium ring-1 ring-inset transition-colors',
              filter === value
                ? 'bg-indigo-600 text-white ring-indigo-600'
                : 'bg-white text-slate-600 ring-slate-300 hover:bg-slate-50',
            ].join(' ')}
          >
            {label}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <div className="mt-4">
          <Card>
            <EmptyState
              title={workspace.tenants.length === 0 ? 'No active tenants' : 'Nothing to show'}
              description={
                workspace.tenants.length === 0
                  ? 'Add tenants first; rent charges are then generated automatically for each month.'
                  : 'Change the filter to see other statements.'
              }
            />
          </Card>
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          {visible.map((statement) => {
            const tenant = workspace.tenants.find((t) => t.id === statement.tenantId)
            if (!tenant) return null
            const isOpen = expanded === statement.tenantId
            return (
              <Card key={statement.tenantId}>
                <div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-base font-semibold text-slate-900">{tenant.name}</h2>
                      <Badge tone={STATUS_TONE[statement.status]}>
                        {STATUS_LABEL[statement.status]}
                      </Badge>
                      <Badge tone="slate">Room {tenant.roomNumber}</Badge>
                    </div>
                    <p className="mt-1 text-sm text-slate-500">
                      Rent {formatINR(statement.rentPaise)} · Electricity{' '}
                      {formatINR(statement.electricityPaise)} · Previous dues{' '}
                      {formatINR(statement.previousOutstandingPaise)} · Paid{' '}
                      {formatINR(statement.paymentsReceivedPaise)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                      Total outstanding
                    </p>
                    <p
                      className={[
                        'num text-xl font-semibold',
                        statement.outstandingPaise > 0 ? 'text-rose-700' : 'text-emerald-700',
                      ].join(' ')}
                    >
                      {statement.outstandingPaise < 0
                        ? `Credit ${formatINR(-statement.outstandingPaise)}`
                        : formatINR(statement.outstandingPaise)}
                    </p>
                  </div>
                </div>

                <div className="px-4 py-4 sm:px-5">
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                    <MiniStat label="Previous dues" value={statement.previousOutstandingPaise} />
                    <MiniStat label="Rent" value={statement.rentPaise} />
                    <MiniStat label="Electricity" value={statement.electricityPaise} />
                    <MiniStat label="Other" value={statement.otherPaise} />
                    <MiniStat label="Payments" value={statement.paymentsReceivedPaise} tone="positive" />
                    <MiniStat label="Advance paid" value={statement.advancePaise} tone="positive" />
                  </div>

                  <div className="mt-4">
                    <ReminderPanel
                      tenant={tenant}
                      statement={statement}
                      onLogged={() => workspace.reload()}
                    />
                  </div>

                  <button
                    type="button"
                    className="mt-4 text-sm font-medium text-indigo-600 hover:underline"
                    onClick={() => setExpanded(isOpen ? null : statement.tenantId)}
                    aria-expanded={isOpen}
                  >
                    {isOpen ? 'Hide calculation breakdown' : 'Show calculation breakdown'}
                  </button>

                  {isOpen && (
                    <div className="mt-3 space-y-4">
                      <div className="rounded-lg bg-slate-50 p-3 text-sm text-slate-700 ring-1 ring-slate-200">
                        <p className="font-medium">How the total is calculated</p>
                        <ul className="mt-1 space-y-0.5">
                          <li>
                            Previous outstanding (all charges before {formatMonth(month)}):{' '}
                            <span className="num font-medium">
                              {formatINR(statement.previousOutstandingPaise)}
                            </span>
                          </li>
                          <li>
                            + Rent: <span className="num font-medium">{formatINR(statement.rentPaise)}</span>
                          </li>
                          <li>
                            + Electricity: <span className="num font-medium">{formatINR(statement.electricityPaise)}</span>
                          </li>
                          <li>
                            + Other: <span className="num font-medium">{formatINR(statement.otherPaise)}</span>
                          </li>
                          <li>
                            + Credits: <span className="num font-medium">{formatINR(statement.creditPaise)}</span>
                          </li>
                          <li>
                            − Payments received up to {formatMonth(month)}:{' '}
                            <span className="num font-medium">
                              {formatINR(statement.paymentsToDatePaise)}
                            </span>
                          </li>
                          <li className="border-t border-slate-200 pt-1 font-semibold">
                            = Outstanding:{' '}
                            <span className="num">{formatINR(statement.outstandingPaise)}</span>
                          </li>
                        </ul>
                      </div>

                      <div>
                        <h3 className="text-sm font-semibold text-slate-800">Charge ledger</h3>
                        <div className="mt-2 overflow-hidden rounded-lg ring-1 ring-slate-200">
                          <TableWrap>
                            <thead>
                              <Tr>
                                <Th>Date</Th>
                                <Th>Type</Th>
                                <Th>Period</Th>
                                <Th>Description</Th>
                                <Th align="right">Billed</Th>
                                <Th align="right">Paid</Th>
                                <Th align="right">Balance</Th>
                              </Tr>
                            </thead>
                            <tbody>
                              {statement.lines.length === 0 ? (
                                <Tr>
                                  <Td colSpan={7} className="py-6 text-center text-slate-500">
                                    No charges yet for this tenant.
                                  </Td>
                                </Tr>
                              ) : (
                                statement.lines.map((line) => (
                                  <Tr key={line.charge.id}>
                                    <Td>{formatDate(line.charge.chargeDate)}</Td>
                                    <Td className="capitalize">{line.charge.chargeType}</Td>
                                    <Td>{formatMonth(line.charge.period)}</Td>
                                    <Td className="max-w-[240px] truncate" >
                                      <span title={line.charge.description ?? ''}>
                                        {line.charge.description || '—'}
                                      </span>
                                    </Td>
                                    <Td align="right" className="num">
                                      {formatINR(line.billedPaise)}
                                    </Td>
                                    <Td align="right" className="num">
                                      {formatINR(line.paidPaise)}
                                    </Td>
                                    <Td
                                      align="right"
                                      className={`num font-medium ${
                                        line.balancePaise > 0 ? 'text-rose-700' : 'text-emerald-700'
                                      }`}
                                    >
                                      {formatINR(line.balancePaise)}
                                    </Td>
                                  </Tr>
                                ))
                              )}
                            </tbody>
                          </TableWrap>
                        </div>
                      </div>

                      {statement.payments.length > 0 && (
                        <div>
                          <h3 className="text-sm font-semibold text-slate-800">Payments to date</h3>
                          <ul className="mt-2 divide-y divide-slate-100 rounded-lg ring-1 ring-slate-200">
                            {statement.payments.map((payment) => (
                              <li
                                key={payment.id}
                                className="flex items-center justify-between px-3 py-2 text-sm"
                              >
                                <span>
                                  {formatDate(payment.paymentDate)} ·{' '}
                                  {payment.method.replace('_', ' ')}
                                  {payment.reference ? ` · ${payment.reference}` : ''}
                                </span>
                                <span className="num font-medium text-emerald-700">
                                  {formatINR(payment.amountPaise)}
                                </span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </Card>
            )
          })}
        </div>
      )}
    </>
  )
}

function MiniStat({
  label,
  value,
  tone = 'neutral',
}: {
  label: string
  value: number
  tone?: 'neutral' | 'positive'
}) {
  return (
    <div className="rounded-lg bg-slate-50 px-3 py-2 ring-1 ring-slate-100">
      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p
        className={[
          'num mt-0.5 text-sm font-semibold',
          tone === 'positive' ? 'text-emerald-700' : 'text-slate-800',
        ].join(' ')}
      >
        {formatINR(value)}
      </p>
    </div>
  )
}
