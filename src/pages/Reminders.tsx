import { useMemo, useState } from 'react'
import { useStore } from '../app/AppState'
import { useAsync, useDebounced } from '../app/hooks'
import { useWorkspace } from '../app/useWorkspace'
import { useToast } from '../app/Toast'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Card, CardHeader, PageHeader } from '../components/ui/Card'
import { Input, Select } from '../components/ui/Field'
import { EmptyState, ErrorState, LoadingBlock } from '../components/ui/States'
import { TableWrap, Td, Th, Tr } from '../components/ui/Table'
import { formatMonth } from '../lib/dates'
import type { ReminderStatus } from '../data/types'

const STATUS_TONE: Record<ReminderStatus, 'amber' | 'green' | 'slate'> = {
  prepared: 'amber',
  sent: 'green',
  skipped: 'slate',
}

const STATUS_LABEL: Record<ReminderStatus, string> = {
  prepared: 'Prepared',
  sent: 'Marked sent',
  skipped: 'Skipped',
}

export function RemindersPage() {
  const store = useStore()
  const toast = useToast()
  const workspace = useWorkspace()
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<'all' | ReminderStatus>('all')
  const debounced = useDebounced(query)

  const logsQuery = useAsync(() => store.listReminderLogs(), [store, workspace.allocations.length])

  const tenantById = useMemo(
    () => new Map(workspace.tenants.map((t) => [t.id, t])),
    [workspace.tenants],
  )

  const filtered = useMemo(() => {
    const q = debounced.trim().toLowerCase()
    return (logsQuery.data ?? []).filter((log) => {
      if (status !== 'all' && log.status !== status) return false
      if (!q) return true
      const tenant = tenantById.get(log.tenantId)
      return (
        (tenant?.name ?? '').toLowerCase().includes(q) ||
        log.period.includes(q) ||
        log.message.toLowerCase().includes(q)
      )
    })
  }, [logsQuery.data, status, debounced, tenantById])

  const mark = async (id: string, next: ReminderStatus) => {
    try {
      await store.updateReminderLog(id, next)
      toast.success('Reminder log updated')
      logsQuery.reload()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    }
  }

  if (logsQuery.loading && !logsQuery.data) return <LoadingBlock label="Loading reminder history" />
  if (logsQuery.error) return <ErrorState message={logsQuery.error} onRetry={logsQuery.reload} />

  return (
    <>
      <PageHeader
        title="Reminder history"
        description="A record of what you prepared or marked as sent. The app cannot tell whether a WhatsApp message was delivered or read — only what you recorded here."
      />

      <Card>
        <CardHeader
          title={`${filtered.length} entr${filtered.length === 1 ? 'y' : 'ies'}`}
          actions={
            <div className="flex flex-wrap items-end gap-2">
              <Input
                label="Search"
                type="search"
                placeholder="Tenant, month or message"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="w-56"
              />
              <Select
                label="Status"
                value={status}
                onChange={(e) => setStatus(e.target.value as 'all' | ReminderStatus)}
                className="w-44"
              >
                <option value="all">All statuses</option>
                <option value="prepared">Prepared</option>
                <option value="sent">Marked sent</option>
                <option value="skipped">Skipped</option>
              </Select>
            </div>
          }
        />
        {filtered.length === 0 ? (
          <EmptyState
            title="No reminders recorded yet"
            description="Open Monthly Statements, prepare a WhatsApp message for a tenant, and it will appear here."
          />
        ) : (
          <TableWrap>
            <thead>
              <Tr>
                <Th>When</Th>
                <Th>Tenant</Th>
                <Th>Month</Th>
                <Th>Channel</Th>
                <Th>Status</Th>
                <Th>Message</Th>
                <Th align="right">Actions</Th>
              </Tr>
            </thead>
            <tbody>
              {filtered.map((log) => (
                <Tr key={log.id}>
                  <Td className="whitespace-nowrap">{new Date(log.createdAt).toLocaleString('en-IN')}</Td>
                  <Td className="font-medium text-slate-900">
                    {tenantById.get(log.tenantId)?.name ?? 'Unknown tenant'}
                  </Td>
                  <Td>{formatMonth(log.period)}</Td>
                  <Td className="capitalize">{log.channel}</Td>
                  <Td>
                    <Badge tone={STATUS_TONE[log.status]}>{STATUS_LABEL[log.status]}</Badge>
                  </Td>
                  <Td className="max-w-[280px]">
                    <details>
                      <summary className="cursor-pointer text-sm text-indigo-600">View</summary>
                      <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded bg-slate-50 p-2 text-xs text-slate-700">
                        {log.message}
                      </pre>
                    </details>
                  </Td>
                  <Td align="right">
                    <div className="flex justify-end gap-1.5">
                      {log.status !== 'sent' && (
                        <Button size="sm" onClick={() => void mark(log.id, 'sent')}>
                          Mark sent
                        </Button>
                      )}
                      {log.status !== 'skipped' && (
                        <Button size="sm" onClick={() => void mark(log.id, 'skipped')}>
                          Mark skipped
                        </Button>
                      )}
                    </div>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </Card>
    </>
  )
}
