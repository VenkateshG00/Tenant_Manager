import { useMemo, useState } from 'react'
import { useAppState, useStore } from '../app/AppState'
import { isDemoMode, SUPABASE_URL } from '../app/env'
import { useAsync } from '../app/hooks'
import { useWorkspace } from '../app/useWorkspace'
import { Button } from '../components/ui/Button'
import { Card, CardHeader, PageHeader } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'
import { ErrorState, InlineNotice, LoadingBlock } from '../components/ui/States'
import { TableWrap, Td, Th, Tr } from '../components/ui/Table'
import { defaultBillProvider } from '../lib/bill-provider'
import { APP_TIMEZONE, formatMonth } from '../lib/dates'
import { currentMonthKey } from '../lib/dates'

export function SettingsPage() {
  const store = useStore()
  const { email, supabase } = useAppState()
  const workspace = useWorkspace()
  const [exported, setExported] = useState(false)

  const auditQuery = useAsync(() => store.listAuditLogs(), [store, workspace.charges.length, workspace.payments.length])

  const summary = useMemo(() => {
    const activeTenants = workspace.tenants.filter((t) => t.isActive).length
    const activeMeters = workspace.meters.filter((m) => m.isActive).length
    return { activeTenants, activeMeters, bills: workspace.bills.length, payments: workspace.payments.length }
  }, [workspace])

  const downloadBackup = () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      note: 'Backup of ledger data. Money values are integer paise.',
      tenants: workspace.tenants,
      meters: workspace.meters,
      bills: workspace.bills.map(({ meter: _meter, ...bill }) => bill),
      charges: workspace.charges,
      payments: workspace.payments,
      allocations: workspace.allocations,
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `rent-electricity-backup-${currentMonthKey()}.json`
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    URL.revokeObjectURL(url)
    setExported(true)
  }

  if (workspace.loading) return <LoadingBlock label="Loading settings" />

  return (
    <>
      <PageHeader
        title="Settings & system info"
        description="Connection status, data model notes, audit trail and backups."
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Connection" />
          <div className="space-y-3 px-4 py-4 text-sm text-slate-700 sm:px-5">
            <Row label="Mode">
              <Badge tone={isDemoMode ? 'amber' : 'green'}>
                {isDemoMode ? 'Demo (in-memory sample data)' : 'Supabase'}
              </Badge>
            </Row>
            {!isDemoMode && (
              <Row label="Project URL">
                <span className="min-w-0 break-all font-mono text-xs sm:text-right">{SUPABASE_URL}</span>
              </Row>
            )}
            <Row label="Signed in as">{email ?? '—'}</Row>
            <Row label="Timezone">{APP_TIMEZONE}</Row>
            <Row label="Currency">INR (₹)</Row>
            {isDemoMode && (
              <InlineNotice tone="warning" title="Demo mode">
                Nothing you enter here is stored. Create a Supabase project, run the migrations, then
                add <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> to{' '}
                <code>.env.local</code> to switch to real data. The README has the exact steps.
              </InlineNotice>
            )}
            {!isDemoMode && !supabase && (
              <InlineNotice tone="danger">Supabase client failed to initialise.</InlineNotice>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Data at a glance" />
          <div className="grid grid-cols-2 gap-3 px-4 py-4 sm:px-5">
            <Mini label="Active tenants" value={summary.activeTenants} />
            <Mini label="Active meters" value={summary.activeMeters} />
            <Mini label="Bills recorded" value={summary.bills} />
            <Mini label="Payments recorded" value={summary.payments} />
          </div>
          <div className="border-t border-slate-100 px-4 py-4 sm:px-5">
            <Button variant="secondary" onClick={downloadBackup}>
              Download JSON backup
            </Button>
            {exported && (
              <p className="mt-2 text-xs text-emerald-700">
                Backup downloaded. Keep it somewhere safe — it contains phone numbers and amounts.
              </p>
            )}
          </div>
        </Card>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Official bill lookup"
            subtitle="Bills are always verified manually on the provider's own site."
          />
          <div className="space-y-3 px-4 py-4 text-sm text-slate-700 sm:px-5">
            <Row label="Provider">{defaultBillProvider.name}</Row>
            <Row label="Automatic fetch">
              <Badge tone="amber">Not available</Badge>
            </Row>
            <p className="text-sm text-slate-600">
              TGNPDCL does not publish a free authorised bill-enquiry API for LT consumers, and no
              BBPS integration has been connected here. The app therefore never claims to fetch
              bills. The adapter layer (<code>src/lib/bill-provider</code>) is the single place a
              real integration would be added later, without touching the rest of the app.
            </p>
            <Button
              variant="secondary"
              onClick={() =>
                window.open(defaultBillProvider.lookupTarget('').url, '_blank', 'noopener,noreferrer')
              }
            >
              Open official Know Your Bill page
            </Button>
          </div>
        </Card>

        <Card>
          <CardHeader
            title="How balances work"
            subtitle="Applied consistently everywhere in the app."
          />
          <ul className="space-y-2 px-4 py-4 text-sm text-slate-700 sm:px-5">
            <li>
              <strong>Outstanding</strong> = Σ charges dated up to the month − Σ payments received by
              then. An overpayment shows as a credit, never as a lost amount.
            </li>
            <li>
              <strong>Payment allocation</strong> is FIFO: the oldest unpaid charge is cleared
              first. Any leftover stays as an unallocated credit.
            </li>
            <li>
              <strong>Shared meters</strong> are split by the allocation weights you configure per
              meter. Splits use largest-remainder maths so the parts always add back to the bill.
            </li>
            <li>
              <strong>Money</strong> is stored as exact decimals in the database and as integer
              paise in the browser — never floating point.
            </li>
            <li>
              <strong>Rent charges</strong> are created automatically for each active tenant when
              you open a billing month.
            </li>
          </ul>
        </Card>
      </div>

      <div className="mt-4">
        <Card>
          <CardHeader
            title="Audit trail"
            subtitle="Latest recorded changes to financial records (last 100)."
          />
          {auditQuery.loading ? (
            <LoadingBlock label="Loading audit trail" />
          ) : auditQuery.error ? (
            <div className="p-4">
              <ErrorState message={auditQuery.error} onRetry={auditQuery.reload} />
            </div>
          ) : (auditQuery.data ?? []).length === 0 ? (
            <p className="px-4 py-6 text-sm text-slate-500 sm:px-5">
              No entries yet. Every create, update and delete of a bill, charge or payment is
              recorded here (in demo mode the trail lives only in memory).
            </p>
          ) : (
            <TableWrap>
              <thead>
                <Tr>
                  <Th>When</Th>
                  <Th>Entity</Th>
                  <Th>Action</Th>
                </Tr>
              </thead>
              <tbody>
                {(auditQuery.data ?? []).slice(0, 50).map((entry) => (
                  <Tr key={entry.id}>
                    <Td className="whitespace-nowrap">
                      {new Date(entry.createdAt).toLocaleString('en-IN')}
                    </Td>
                    <Td>
                      {entry.entityType}
                      {entry.entityId ? ` · ${entry.entityId.slice(0, 8)}` : ''}
                    </Td>
                    <Td className="capitalize">{entry.action.replace(/_/g, ' ')}</Td>
                  </Tr>
                ))}
              </tbody>
            </TableWrap>
          )}
        </Card>
      </div>

      <div className="mt-4">
        <Card>
          <CardHeader title="This month" subtitle={`Billing month currently selected: ${formatMonth(currentMonthKey())}`} />
          <p className="px-4 py-4 text-sm text-slate-600 sm:px-5">
            {summary.activeTenants} active tenant{summary.activeTenants === 1 ? '' : 's'} ·{' '}
            {summary.activeMeters} active meter{summary.activeMeters === 1 ? '' : 's'}
          </p>
        </Card>
      </div>
    </>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <span className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</span>
      <span className="sm:text-right">{children}</span>
    </div>
  )
}

function Mini({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-slate-50 px-3 py-2 ring-1 ring-slate-100">
      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="num mt-0.5 text-lg font-semibold text-slate-900">{value}</p>
    </div>
  )
}
