import { useMemo, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useMonth } from '../app/MonthProvider'
import { useWorkspace } from '../app/useWorkspace'
import { useToast } from '../app/Toast'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Card, CardHeader, PageHeader } from '../components/ui/Card'
import { Input, Select, Textarea } from '../components/ui/Field'
import { ConfirmDialog, Modal } from '../components/ui/Modal'
import { MonthSelect } from '../components/ui/MonthSelect'
import { EmptyState, ErrorState, InlineNotice, LoadingBlock } from '../components/ui/States'
import { TableWrap, Td, Th, Tr } from '../components/ui/Table'
import { formatINR, paiseToInputValue } from '../lib/money'
import { formatDate, formatMonth } from '../lib/dates'
import { parseRupees, validateHttpsUrl } from '../lib/validation'
import { defaultBillProvider } from '../lib/bill-provider'
import { useStore } from '../app/AppState'
import type { Bill, BillSource, BillStatus } from '../data/types'

const STATUS_TONE: Record<BillStatus, 'amber' | 'sky' | 'green' | 'slate'> = {
  pending_verification: 'amber',
  verified: 'sky',
  paid: 'green',
  void: 'slate',
}

const STATUS_LABEL: Record<BillStatus, string> = {
  pending_verification: 'Needs verification',
  verified: 'Verified',
  paid: 'Paid',
  void: 'Void',
}

interface BillForm {
  meterId: string
  billingMonth: string
  amount: string
  billGeneratedAt: string
  dueDate: string
  billReference: string
  receiptUrl: string
  source: BillSource
  notes: string
}

export function BillsPage() {
  const store = useStore()
  const toast = useToast()
  const workspace = useWorkspace()
  const { month } = useMonth()
  const [params, setParams] = useSearchParams()

  const [open, setOpen] = useState(params.get('new') === '1')
  const [meterPickerOpen, setMeterPickerOpen] = useState(false)
  const [selectedMeterId, setSelectedMeterId] = useState('')
  const [editing, setEditing] = useState<Bill | null>(null)
  const [form, setForm] = useState<BillForm>({
    meterId: '',
    billingMonth: month,
    amount: '',
    billGeneratedAt: '',
    dueDate: '',
    billReference: '',
    receiptUrl: '',
    source: 'official_lookup',
    notes: '',
  })
  const [formError, setFormError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [statusFilter, setStatusFilter] = useState<'all' | BillStatus>('all')
  const [onlyMonth, setOnlyMonth] = useState(true)
  const [query, setQuery] = useState('')
  const [toDelete, setToDelete] = useState<Bill | null>(null)
  const [lookupBill, setLookupBill] = useState<Bill | null>(null)

  const meterById = useMemo(() => new Map(workspace.meters.map((m) => [m.id, m])), [workspace.meters])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return workspace.bills.filter((bill) => {
      if (onlyMonth && bill.billingMonth !== month) return false
      if (statusFilter !== 'all' && bill.status !== statusFilter) return false
      if (!q) return true
      const meter = meterById.get(bill.meterId)
      return (
        (meter?.meterCode ?? '').toLowerCase().includes(q) ||
        (meter?.uscNumber ?? '').toLowerCase().includes(q) ||
        (meter?.roomLabel ?? '').toLowerCase().includes(q) ||
        (bill.billReference ?? '').toLowerCase().includes(q)
      )
    })
  }, [workspace.bills, onlyMonth, month, statusFilter, query, meterById])

  const activeMeters = workspace.meters.filter((m) => m.isActive)

  const openCreate = () => {
    setEditing(null)
    setSelectedMeterId(activeMeters[0]?.id ?? '')
    setMeterPickerOpen(true)
    setFormError(null)
    if (params.get('new')) {
      params.delete('new')
      setParams(params, { replace: true })
    }
  }

  const openProviderPage = (meterId: string): boolean => {
    const meter = meterById.get(meterId)
    if (!meter) {
      setFormError('Choose an active meter')
      return false
    }
    const target = defaultBillProvider.lookupTarget(meter.uscNumber)
    window.open(target.url, '_blank', 'noopener,noreferrer')
    if (navigator.clipboard?.writeText) {
      void navigator.clipboard.writeText(meter.uscNumber)
        .then(() => toast.success(`USC ${meter.uscNumber} copied. Paste it into the official form.`))
        .catch(() => toast.push(`Enter USC ${meter.uscNumber} on the official page.`, 'info'))
    } else {
      toast.push(`Enter USC ${meter.uscNumber} on the official page.`, 'info')
    }
    return true
  }

  const openOfficialLookup = (meterId: string) => {
    if (!openProviderPage(meterId)) return
    const meter = meterById.get(meterId)
    if (!meter) return
    setForm({
      meterId,
      billingMonth: month,
      amount: '',
      billGeneratedAt: '',
      dueDate: '',
      billReference: '',
      receiptUrl: '',
      source: 'official_lookup',
      notes: '',
    })
    setFormError(null)
    setOpen(true)
    setMeterPickerOpen(false)
  }

  const openEdit = (bill: Bill) => {
    setEditing(bill)
    setForm({
      meterId: bill.meterId,
      billingMonth: bill.billingMonth,
      amount: paiseToInputValue(bill.amountPaise),
      billGeneratedAt: bill.billGeneratedAt ?? '',
      dueDate: bill.dueDate ?? '',
      billReference: bill.billReference ?? '',
      receiptUrl: bill.receiptUrl ?? '',
      source: bill.source,
      notes: bill.notes ?? '',
    })
    setFormError(null)
    setOpen(true)
  }

  const save = async () => {
    setFormError(null)
    if (!form.meterId) {
      setFormError('Choose a meter')
      return
    }
    const amount = parseRupees(form.amount, 'Bill amount')
    if (!amount.ok) {
      setFormError(amount.error)
      return
    }
    const receiptUrlError = validateHttpsUrl(form.receiptUrl, 'Receipt URL')
    if (receiptUrlError) {
      setFormError(receiptUrlError)
      return
    }
    setBusy(true)
    try {
      const payload = {
        meterId: form.meterId,
        billingMonth: form.billingMonth,
        amountPaise: amount.paise,
        billGeneratedAt: form.billGeneratedAt || null,
        dueDate: form.dueDate || null,
        billReference: form.billReference.trim() || null,
        receiptUrl: form.receiptUrl.trim() || null,
        status: (editing?.status ?? 'pending_verification') as BillStatus,
        source: form.source,
        notes: form.notes.trim() || null,
      }
      if (editing) {
        await store.updateBill(editing.id, payload)
        toast.success('Bill updated')
      } else {
        await store.createBill(payload)
        toast.success('Bill saved as “needs verification”')
      }
      setOpen(false)
      workspace.reload()
    } catch (error) {
      setFormError(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }

  const verifyAndApply = async (bill: Bill) => {
    try {
      if (bill.status === 'pending_verification') {
        await store.setBillStatus(bill.id, 'verified')
      }
      const created = await store.applyBill(bill.id)
      toast.success(
        created > 0
          ? `Verified — ${created} electricity charge${created === 1 ? '' : 's'} created`
          : 'Already applied — no new charges created',
      )
      workspace.reload()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    }
  }

  const setStatus = async (bill: Bill, status: BillStatus) => {
    try {
      await store.setBillStatus(bill.id, status)
      toast.success(`Bill marked ${STATUS_LABEL[status].toLowerCase()}`)
      workspace.reload()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    }
  }

  const confirmDelete = async () => {
    if (!toDelete) return
    try {
      await store.deleteBill(toDelete.id)
      toast.success('Bill deleted')
      setToDelete(null)
      workspace.reload()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
      setToDelete(null)
    }
  }

  if (workspace.loading) return <LoadingBlock label="Loading bills" />
  if (workspace.error) return <ErrorState message={workspace.error} onRetry={workspace.reload} />

  const pendingCount = workspace.bills.filter((b) => b.status === 'pending_verification').length

  return (
    <>
      <PageHeader
        title="Electricity bills"
        description="Enter each TGNPDCL bill after checking it on the official page. Unverified amounts are flagged until confirmed."
        actions={
          <>
            <MonthSelect label="Show" />
            <Button variant="primary" onClick={openCreate}>
              + Add bill
            </Button>
          </>
        }
      />

      {pendingCount > 0 && (
        <div className="mb-4">
          <InlineNotice tone="warning" title={`${pendingCount} bill${pendingCount === 1 ? '' : 's'} still need verification`}>
            Bills marked “needs verification” have not been checked against the official TGNPDCL
            page yet. Verify them before generating statements or sending reminders.
          </InlineNotice>
        </div>
      )}

      <Card>
        <CardHeader
          title={`${filtered.length} bill${filtered.length === 1 ? '' : 's'}`}
          actions={
            <div className="flex flex-wrap items-end gap-2">
              <Input
                label="Search"
                type="search"
                placeholder="Meter, USC or reference"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="w-56"
              />
              <Select
                label="Status"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as 'all' | BillStatus)}
                className="w-48"
              >
                <option value="all">All statuses</option>
                <option value="pending_verification">Needs verification</option>
                <option value="verified">Verified</option>
                <option value="paid">Paid</option>
                <option value="void">Void</option>
              </Select>
              <Select
                label="Period"
                value={onlyMonth ? month : 'all'}
                onChange={(e) => setOnlyMonth(e.target.value !== 'all')}
                className="w-48"
              >
                <option value={month}>{formatMonth(month)} only</option>
                <option value="all">All months</option>
              </Select>
            </div>
          }
        />
        {filtered.length === 0 ? (
          <EmptyState
            title="No bills here yet"
            description="Record the first electricity bill after checking the amount on the TGNPDCL site."
            action={
              <Button variant="primary" onClick={openCreate}>
                + Add bill
              </Button>
            }
          />
        ) : (
          <TableWrap>
            <thead>
              <Tr>
                <Th>Meter</Th>
                <Th>Month</Th>
                <Th align="right">Amount</Th>
                <Th>Generated</Th>
                <Th>Due</Th>
                <Th>Status</Th>
                <Th>Source</Th>
                <Th align="right">Actions</Th>
              </Tr>
            </thead>
            <tbody>
              {filtered.map((bill) => {
                const meter = meterById.get(bill.meterId)
                return (
                  <Tr key={bill.id}>
                    <Td>
                      <p className="font-medium text-slate-900">{meter?.meterCode ?? 'Unknown'}</p>
                      <p className="text-xs text-slate-500">
                        USC {meter?.uscNumber ?? '—'} · {meter?.roomLabel ?? ''}
                      </p>
                    </Td>
                    <Td>{formatMonth(bill.billingMonth)}</Td>
                    <Td align="right" className="num font-semibold">
                      {formatINR(bill.amountPaise)}
                    </Td>
                    <Td>{formatDate(bill.billGeneratedAt) || '—'}</Td>
                    <Td>{formatDate(bill.dueDate) || '—'}</Td>
                    <Td>
                      <div className="flex flex-col gap-1">
                        <Badge tone={STATUS_TONE[bill.status]}>{STATUS_LABEL[bill.status]}</Badge>
                        {bill.status === 'verified' && !bill.hasCharges && (
                          <Badge tone="amber">Charges not applied</Badge>
                        )}
                      </div>
                    </Td>
                    <Td>
                      <span className="text-xs text-slate-600">
                        {bill.source === 'official_lookup' ? 'Official page checked' : 'Manual entry'}
                      </span>
                    </Td>
                    <Td align="right">
                      <div className="flex flex-wrap justify-end gap-1.5">
                        <Button
                          size="sm"
                          onClick={() => {
                            const target = defaultBillProvider.lookupTarget(meter?.uscNumber ?? '')
                            window.open(target.url, '_blank', 'noopener,noreferrer')
                            setLookupBill(bill)
                          }}
                        >
                          Official bill
                        </Button>
                        {bill.status === 'pending_verification' && (
                          <Button size="sm" variant="primary" onClick={() => void verifyAndApply(bill)}>
                            Verify &amp; apply
                          </Button>
                        )}
                        {bill.status === 'verified' && !bill.hasCharges && (
                          <Button size="sm" variant="primary" onClick={() => void verifyAndApply(bill)}>
                            Apply charges
                          </Button>
                        )}
                        {bill.status === 'verified' && (
                          <Button size="sm" onClick={() => void setStatus(bill, 'paid')}>
                            Mark paid
                          </Button>
                        )}
                        {bill.status === 'paid' && (
                          <Button size="sm" onClick={() => void setStatus(bill, 'verified')}>
                            Mark unpaid
                          </Button>
                        )}
                        <Button size="sm" onClick={() => openEdit(bill)}>
                          Edit
                        </Button>
                        <Button size="sm" variant="danger" onClick={() => setToDelete(bill)}>
                          Delete
                        </Button>
                      </div>
                    </Td>
                  </Tr>
                )
              })}
            </tbody>
          </TableWrap>
        )}
      </Card>

      <Modal
        open={meterPickerOpen}
        title="Choose the meter to check"
        description="Select a meter to open its official TGNPDCL bill lookup."
        onClose={() => setMeterPickerOpen(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setMeterPickerOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={() => openOfficialLookup(selectedMeterId)}
              disabled={!selectedMeterId}
            >
              Open official bill page
            </Button>
          </>
        }
      >
        {activeMeters.length === 0 ? (
          <EmptyState
            title="No active meters"
            description="Add or reactivate a meter before recording an electricity bill."
          />
        ) : (
          <div className="space-y-4">
            <Select
              label="Meter"
              required
              value={selectedMeterId}
              onChange={(event) => setSelectedMeterId(event.target.value)}
            >
              <option value="">Choose a meter…</option>
              {activeMeters.map((meter) => (
                <option key={meter.id} value={meter.id}>
                  {meter.meterCode} · USC {meter.uscNumber} · {meter.roomLabel}
                </option>
              ))}
            </Select>
            <InlineNotice tone="info">
              The official lookup opens in a new tab. The USC is copied when your browser permits;
              paste it into TGNPDCL, check the amount, then return here to save the bill.
            </InlineNotice>
          </div>
        )}
      </Modal>

      <Modal
        open={open}
        wide
        title={editing ? 'Edit bill' : 'Record electricity bill'}
        onClose={() => setOpen(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button variant="primary" onClick={() => void save()} busy={busy}>
              {editing ? 'Save changes' : 'Save bill'}
            </Button>
          </>
        }
      >
        <form
          className="space-y-4"
          onSubmit={(e: FormEvent) => {
            e.preventDefault()
            void save()
          }}
        >
          <InlineNotice tone="info">
            Check the bill on the official page, then enter the amount below. This app cannot read
            the external page, so the bill is not saved until you enter the amount and choose Save.
            New bills start as <strong>needs verification</strong>. When editing, the current status
            is preserved.
          </InlineNotice>

          {!editing && meterById.get(form.meterId) && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-slate-50 p-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  USC / Service number
                </p>
                <p className="num mt-1 font-semibold text-slate-900">
                  {meterById.get(form.meterId)?.uscNumber}
                </p>
              </div>
              <Button
                type="button"
                variant="secondary"
                onClick={() => openProviderPage(form.meterId)}
              >
                Reopen official page
              </Button>
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Select
              label="Meter"
              required
              value={form.meterId}
              disabled={!editing}
              onChange={(e) => setForm((f) => ({ ...f, meterId: e.target.value }))}
              hint="Only active meters are listed."
            >
              <option value="">Choose a meter…</option>
              {activeMeters.map((meter) => (
                <option key={meter.id} value={meter.id}>
                  {meter.meterCode} · USC {meter.uscNumber} · {meter.roomLabel}
                </option>
              ))}
            </Select>
            <Input
              label="Billing month"
              type="month"
              required
              value={form.billingMonth}
              onChange={(e) => setForm((f) => ({ ...f, billingMonth: e.target.value }))}
              hint="One bill per meter per month is allowed."
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Input
              label="Bill amount (₹)"
              required
              inputMode="decimal"
              placeholder="480.00"
              value={form.amount}
              onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
            />
            <Input
              label="Bill generated on"
              type="date"
              value={form.billGeneratedAt}
              onChange={(e) => setForm((f) => ({ ...f, billGeneratedAt: e.target.value }))}
            />
            <Input
              label="Due date"
              type="date"
              value={form.dueDate}
              onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              label="Bill / receipt reference"
              value={form.billReference}
              onChange={(e) => setForm((f) => ({ ...f, billReference: e.target.value }))}
              hint="Printed on the TGNPDCL bill, if available."
            />
            <Input
              label="Receipt image URL (optional)"
              type="url"
              value={form.receiptUrl}
              onChange={(e) => setForm((f) => ({ ...f, receiptUrl: e.target.value }))}
              error={formError?.startsWith('Receipt URL') ? formError : undefined}
              hint="A link to a photo or scan you have stored elsewhere."
            />
          </div>

          <Select
            label="How was this amount obtained?"
            value={form.source}
            onChange={(e) => setForm((f) => ({ ...f, source: e.target.value as BillSource }))}
            hint="Recorded so unverified manual entries are always visible."
          >
            <option value="official_lookup">Checked on the official TGNPDCL page</option>
            <option value="manual_entry">Manual entry (paper bill / photo, not yet cross-checked)</option>
          </Select>

          <Textarea
            label="Notes"
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
          />

          {formError && <InlineNotice tone="danger" title="Could not save">{formError}</InlineNotice>}
          <button type="submit" className="sr-only">
            Submit
          </button>
        </form>
      </Modal>

      <Modal
        open={lookupBill !== null}
        title="Verify this bill on the official page"
        onClose={() => setLookupBill(null)}
        footer={
          <Button variant="secondary" onClick={() => setLookupBill(null)}>
            Close
          </Button>
        }
      >
        {lookupBill && (
          <div className="space-y-3 text-sm text-slate-700">
            <p>
              Enter this USC on the official <strong>Know Your Bill (LT)</strong> page, confirm the
              consumer name and month, then compare the amount saved here.
            </p>
            <div className="rounded-lg bg-slate-50 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                USC · {formatMonth(lookupBill.billingMonth)}
              </p>
              <p className="num mt-1 text-lg font-semibold text-slate-900">
                {meterById.get(lookupBill.meterId)?.uscNumber ?? '—'}
              </p>
              <p className="num mt-1 text-sm text-slate-600">
                Saved amount: {formatINR(lookupBill.amountPaise)}
              </p>
            </div>
            <Button
              variant="secondary"
              onClick={() =>
                window.open(
                  defaultBillProvider.lookupTarget(meterById.get(lookupBill.meterId)?.uscNumber ?? '').url,
                  '_blank',
                  'noopener,noreferrer',
                )
              }
            >
              Open the official page
            </Button>
            <InlineNotice tone="warning">
              If the official amount differs, edit the bill before verifying. Nothing is sent to the
              provider and no data is read automatically.
            </InlineNotice>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={toDelete !== null}
        title="Delete bill?"
        danger
        confirmLabel="Delete bill"
        onCancel={() => setToDelete(null)}
        onConfirm={() => void confirmDelete()}
        message={
          <div className="space-y-2">
            <p>
              Deleting removes the bill and any electricity charges created from it for{' '}
              <strong>{toDelete ? formatMonth(toDelete.billingMonth) : ''}</strong>. Statements for
              that month will be recalculated from the remaining ledger.
            </p>
            <p className="text-xs text-slate-500">
              A confirmation is required because this changes financial history.
            </p>
          </div>
        }
      />
    </>
  )
}
