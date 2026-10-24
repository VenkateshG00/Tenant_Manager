import { useMemo, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useStore } from '../app/AppState'
import { useWorkspace } from '../app/useWorkspace'
import { useToast } from '../app/Toast'
import { useMonth } from '../app/MonthProvider'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Card, CardHeader, PageHeader } from '../components/ui/Card'
import { Input, Select, Textarea } from '../components/ui/Field'
import { ConfirmDialog, Modal } from '../components/ui/Modal'
import { EmptyState, ErrorState, InlineNotice, LoadingBlock } from '../components/ui/States'
import { TableWrap, Td, Th, Tr } from '../components/ui/Table'
import { formatINR, paiseToDecimalString, sumPaise } from '../lib/money'
import { formatDate, formatMonth, todayISO } from '../lib/dates'
import { parseRupees } from '../lib/validation'
import { downloadCsv } from '../lib/csv'
import type { Charge, ChargeType, Payment, PaymentMethod } from '../data/types'

const METHOD_LABEL: Record<PaymentMethod, string> = {
  cash: 'Cash',
  upi: 'UPI',
  bank_transfer: 'Bank transfer',
  cheque: 'Cheque',
  other: 'Other',
}

interface PaymentReceipt {
  payment: Payment
  tenantName: string
  allocations: { charge: Charge; amountPaise: number }[]
}

export function PaymentsPage() {
  const store = useStore()
  const toast = useToast()
  const workspace = useWorkspace()
  const { month } = useMonth()
  const [params, setParams] = useSearchParams()

  const [payOpen, setPayOpen] = useState(params.get('new') === '1')
  const [chargeOpen, setChargeOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [toDeletePayment, setToDeletePayment] = useState<Payment | null>(null)
  const [toDeleteCharge, setToDeleteCharge] = useState<Charge | null>(null)
  const [receipt, setReceipt] = useState<PaymentReceipt | null>(null)

  const [payForm, setPayForm] = useState({
    tenantId: '',
    paymentDate: todayISO(),
    amount: '',
    method: 'upi' as PaymentMethod,
    reference: '',
    notes: '',
  })

  const [chargeForm, setChargeForm] = useState({
    tenantId: '',
    chargeType: 'other' as ChargeType,
    amount: '',
    description: '',
    chargeDate: todayISO(),
  })

  const tenantById = useMemo(
    () => new Map(workspace.tenants.map((t) => [t.id, t])),
    [workspace.tenants],
  )

  const chargeById = useMemo(
    () => new Map(workspace.charges.map((c) => [c.id, c])),
    [workspace.charges],
  )

  const allocationsByPayment = useMemo(() => {
    const map = new Map<string, { charge: Charge; amountPaise: number }[]>()
    for (const allocation of workspace.allocations) {
      const charge = chargeById.get(allocation.chargeId)
      if (!charge) continue
      const list = map.get(allocation.paymentId) ?? []
      list.push({ charge, amountPaise: allocation.amountPaise })
      map.set(allocation.paymentId, list)
    }
    return map
  }, [workspace.allocations, chargeById])

  const openPaymentModal = () => {
    setPayForm({
      tenantId: workspace.tenants.find((t) => t.isActive)?.id ?? '',
      paymentDate: todayISO(),
      amount: '',
      method: 'upi',
      reference: '',
      notes: '',
    })
    setFormError(null)
    setPayOpen(true)
    if (params.get('new')) {
      params.delete('new')
      setParams(params, { replace: true })
    }
  }

  const openChargeModal = () => {
    setChargeForm({
      tenantId: workspace.tenants.find((t) => t.isActive)?.id ?? '',
      chargeType: 'other',
      amount: '',
      description: '',
      chargeDate: todayISO(),
    })
    setFormError(null)
    setChargeOpen(true)
  }

  const savePayment = async () => {
    setFormError(null)
    if (!payForm.tenantId) {
      setFormError('Choose a tenant')
      return
    }
    const amount = parseRupees(payForm.amount, 'Amount')
    if (!amount.ok) {
      setFormError(amount.error)
      return
    }
    setBusy(true)
    try {
      const payment = await store.recordPayment({
        tenantId: payForm.tenantId,
        paymentDate: payForm.paymentDate,
        amountPaise: amount.paise,
        method: payForm.method,
        reference: payForm.reference.trim() || null,
        notes: payForm.notes.trim() || null,
      })
      setPayOpen(false)
      workspace.reload()
      try {
        const [charges, allocations] = await Promise.all([
          store.listCharges(),
          store.listAllocations(),
        ])
        const chargeById = new Map(charges.map((charge) => [charge.id, charge]))
        setReceipt({
          payment,
          tenantName: tenantById.get(payment.tenantId)?.name ?? 'Tenant',
          allocations: allocations
            .filter((allocation) => allocation.paymentId === payment.id)
            .flatMap((allocation) => {
              const charge = chargeById.get(allocation.chargeId)
              return charge ? [{ charge, amountPaise: allocation.amountPaise }] : []
            }),
        })
        toast.success('Payment recorded and allocated to the oldest unpaid charges')
      } catch (error) {
        setReceipt({
          payment,
          tenantName: tenantById.get(payment.tenantId)?.name ?? 'Tenant',
          allocations: [],
        })
        toast.error(
          `Payment was saved, but receipt allocation details could not be loaded: ${
            error instanceof Error ? error.message : String(error)
          }`,
        )
      }
    } catch (error) {
      setFormError(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }

  const saveCharge = async () => {
    setFormError(null)
    if (!chargeForm.tenantId) {
      setFormError('Choose a tenant')
      return
    }
    const amount = parseRupees(chargeForm.amount, 'Amount', {
      allowZero: chargeForm.chargeType === 'credit',
    })
    if (!amount.ok) {
      setFormError(amount.error)
      return
    }
    const paise = amount.paise
    setBusy(true)
    try {
      await store.createCharge({
        tenantId: chargeForm.tenantId,
        chargeType: chargeForm.chargeType,
        period: chargeForm.chargeDate.slice(0, 7),
        chargeDate: chargeForm.chargeDate,
        amountPaise: chargeForm.chargeType === 'credit' ? -Math.abs(paise) : paise,
        description: chargeForm.description.trim() || null,
      })
      toast.success(chargeForm.chargeType === 'credit' ? 'Credit recorded' : 'Charge added')
      setChargeOpen(false)
      workspace.reload()
    } catch (error) {
      setFormError(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }

  const confirmDeletePayment = async () => {
    if (!toDeletePayment) return
    try {
      await store.deletePayment(toDeletePayment.id)
      toast.success('Payment removed and allocations released')
      setToDeletePayment(null)
      workspace.reload()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
      setToDeletePayment(null)
    }
  }

  const confirmDeleteCharge = async () => {
    if (!toDeleteCharge) return
    try {
      await store.deleteCharge(toDeleteCharge.id)
      toast.success('Charge removed')
      setToDeleteCharge(null)
      workspace.reload()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
      setToDeleteCharge(null)
    }
  }

  if (workspace.loading) return <LoadingBlock label="Loading payments" />
  if (workspace.error) return <ErrorState message={workspace.error} onRetry={workspace.reload} />

  const otherCharges = workspace.charges
    .filter((c) => c.chargeType === 'other' || c.chargeType === 'credit')
    .sort((a, b) => (a.chargeDate < b.chargeDate ? 1 : -1))

  const totalUnallocated = sumPaise(
    workspace.allocations
      .filter((a) => !chargeById.has(a.chargeId))
      .map((a) => a.amountPaise),
  )

  return (
    <>
      <PageHeader
        title="Payments & adjustments"
        description="Record money received and any other charges or credits. Payments are allocated to the oldest unpaid charge first."
        actions={
          <>
            <Button
              variant="secondary"
              onClick={() => downloadCsv('payments.csv', [
                ['Date', 'Tenant', 'Room', 'Amount (INR)', 'Method', 'Reference', 'Notes'],
                ...workspace.payments.map((payment) => {
                  const tenant = tenantById.get(payment.tenantId)
                  return [
                    payment.paymentDate,
                    tenant?.name ?? 'Unknown',
                    tenant?.roomNumber ?? '',
                    paiseToDecimalString(payment.amountPaise),
                    METHOD_LABEL[payment.method],
                    payment.reference ?? '',
                    payment.notes ?? '',
                  ]
                }),
              ])}
            >
              Export CSV
            </Button>
            <Button variant="secondary" onClick={openChargeModal}>
              + Other charge / credit
            </Button>
            <Button variant="primary" onClick={openPaymentModal}>
              + Record payment
            </Button>
          </>
        }
      />

      {totalUnallocated !== 0 && (
        <div className="mb-4">
          <InlineNotice tone="warning">
            Some allocations no longer match a charge ({formatINR(Math.abs(totalUnallocated))}). This
            usually means a charge was removed outside the app. Review the ledger before relying on
            balances.
          </InlineNotice>
        </div>
      )}

      <Card>
        <CardHeader
          title={`Payments (${workspace.payments.length})`}
          subtitle={`Allocation rule: oldest charge first · selected month is ${formatMonth(month)}`}
        />
        {workspace.payments.length === 0 ? (
          <EmptyState
            title="No payments recorded"
            description="Record the first payment to start clearing balances."
            action={
              <Button variant="primary" onClick={openPaymentModal}>
                + Record payment
              </Button>
            }
          />
        ) : (
          <TableWrap>
            <thead>
              <Tr>
                <Th>Date</Th>
                <Th>Tenant</Th>
                <Th align="right">Amount</Th>
                <Th>Method</Th>
                <Th>Reference</Th>
                <Th>Allocated to</Th>
                <Th align="right">Actions</Th>
              </Tr>
            </thead>
            <tbody>
              {workspace.payments.map((payment) => {
                const allocations = allocationsByPayment.get(payment.id) ?? []
                const allocated = sumPaise(allocations.map((a) => a.amountPaise))
                const leftover = payment.amountPaise - allocated
                return (
                  <Tr key={payment.id}>
                    <Td>{formatDate(payment.paymentDate)}</Td>
                    <Td className="font-medium text-slate-900">
                      {tenantById.get(payment.tenantId)?.name ?? 'Unknown'}
                    </Td>
                    <Td align="right" className="num font-semibold text-emerald-700">
                      {formatINR(payment.amountPaise)}
                    </Td>
                    <Td>{METHOD_LABEL[payment.method]}</Td>
                    <Td>{payment.reference || <span className="text-slate-400">—</span>}</Td>
                    <Td>
                      {allocations.length === 0 ? (
                        <Badge tone="amber">Not allocated</Badge>
                      ) : (
                        <ul className="space-y-0.5 text-xs">
                          {allocations.map((a) => (
                            <li key={a.charge.id}>
                              {a.charge.chargeType} · {formatMonth(a.charge.period)}{' '}
                              <span className="num text-slate-500">
                                {formatINR(a.amountPaise)}
                              </span>
                            </li>
                          ))}
                          {leftover > 0 && (
                            <li className="text-amber-700">
                              Unallocated credit {formatINR(leftover)}
                            </li>
                          )}
                        </ul>
                      )}
                    </Td>
                    <Td align="right">
                      <Button size="sm" variant="danger" onClick={() => setToDeletePayment(payment)}>
                        Delete
                      </Button>
                    </Td>
                  </Tr>
                )
              })}
            </tbody>
          </TableWrap>
        )}
      </Card>

      <div className="mt-5">
        <Card>
          <CardHeader
            title={`Other charges & credits (${otherCharges.length})`}
            subtitle="Maintenance, damage, discounts — anything that is not rent or electricity."
          />
          {otherCharges.length === 0 ? (
            <EmptyState title="No other charges" description="Use “Other charge / credit” to record one." />
          ) : (
            <TableWrap>
              <thead>
                <Tr>
                  <Th>Date</Th>
                  <Th>Tenant</Th>
                  <Th>Type</Th>
                  <Th>Description</Th>
                  <Th align="right">Amount</Th>
                  <Th align="right">Actions</Th>
                </Tr>
              </thead>
              <tbody>
                {otherCharges.map((charge) => (
                  <Tr key={charge.id}>
                    <Td>{formatDate(charge.chargeDate)}</Td>
                    <Td>{tenantById.get(charge.tenantId)?.name ?? 'Unknown'}</Td>
                    <Td>
                      <Badge tone={charge.chargeType === 'credit' ? 'sky' : 'slate'}>
                        {charge.chargeType === 'credit' ? 'Credit' : 'Other charge'}
                      </Badge>
                    </Td>
                    <Td>{charge.description || '—'}</Td>
                    <Td
                      align="right"
                      className={`num font-semibold ${charge.amountPaise < 0 ? 'text-sky-700' : ''}`}
                    >
                      {formatINR(charge.amountPaise)}
                    </Td>
                    <Td align="right">
                      <Button size="sm" variant="danger" onClick={() => setToDeleteCharge(charge)}>
                        Delete
                      </Button>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </TableWrap>
          )}
        </Card>
      </div>

      <Modal
        open={receipt !== null}
        title="Payment receipt"
        description="Payment recorded successfully. Share or print this receipt for your records."
        onClose={() => setReceipt(null)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setReceipt(null)}>Close</Button>
            <Button
              variant="secondary"
              onClick={() => window.print()}
            >
              Print / Save PDF
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                if (!receipt) return
                const text = [
                  'Payment receipt — Rent & Electricity Manager',
                  `Receipt: ${receipt.payment.id}`,
                  `Tenant: ${receipt.tenantName}`,
                  `Date: ${formatDate(receipt.payment.paymentDate)}`,
                  `Amount: ${formatINR(receipt.payment.amountPaise)}`,
                  `Method: ${METHOD_LABEL[receipt.payment.method]}`,
                  receipt.payment.reference ? `Reference: ${receipt.payment.reference}` : '',
                  ...receipt.allocations.map(
                    ({ charge, amountPaise }) =>
                      `Allocated: ${charge.chargeType} · ${formatMonth(charge.period)} · ${formatINR(amountPaise)}`,
                  ),
                  receipt.allocations.length === 0 ? 'Allocation: unallocated credit' : '',
                ].filter(Boolean).join('\n')
                if (navigator.share) {
                  void navigator.share({ title: 'Payment receipt', text }).catch((error: unknown) => {
                    if (error instanceof Error && error.name !== 'AbortError') {
                      toast.error(`Could not share receipt: ${error.message}`)
                    }
                  })
                } else if (navigator.clipboard?.writeText) {
                  void navigator.clipboard.writeText(text).then(
                    () => toast.success('Receipt details copied'),
                    (error: unknown) => toast.error(`Could not copy receipt: ${error instanceof Error ? error.message : String(error)}`),
                  )
                } else {
                  toast.error('Sharing and clipboard are unavailable. Use Print / Save PDF instead.')
                }
              }}
            >
              Share receipt
            </Button>
          </>
        }
      >
        {receipt && (
          <div className="space-y-3 text-sm">
            <p><span className="font-medium">Receipt ID:</span> {receipt.payment.id}</p>
            <p><span className="font-medium">Tenant:</span> {receipt.tenantName}</p>
            <p><span className="font-medium">Date:</span> {formatDate(receipt.payment.paymentDate)}</p>
            <p><span className="font-medium">Amount received:</span> {formatINR(receipt.payment.amountPaise)}</p>
            <p><span className="font-medium">Method:</span> {METHOD_LABEL[receipt.payment.method]}</p>
            {receipt.payment.reference && <p><span className="font-medium">Reference:</span> {receipt.payment.reference}</p>}
            <div>
              <p className="font-medium">Payment allocation</p>
              {receipt.allocations.length === 0 ? (
                <p className="text-slate-600">No charges were cleared; the amount remains an unallocated credit.</p>
              ) : (
                <ul className="mt-1 list-inside list-disc text-slate-600">
                  {receipt.allocations.map(({ charge, amountPaise }) => (
                    <li key={charge.id}>{charge.chargeType} · {formatMonth(charge.period)} · {formatINR(amountPaise)}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </Modal>

      <section id="payment-receipt-print" className="hidden" aria-hidden="true">
        {receipt && (
          <>
            <h1>Payment receipt</h1>
            <p>Rent &amp; Electricity Manager</p>
            <table>
              <tbody>
                <tr><th>Receipt ID</th><td>{receipt.payment.id}</td></tr>
                <tr><th>Tenant</th><td>{receipt.tenantName}</td></tr>
                <tr><th>Payment date</th><td>{formatDate(receipt.payment.paymentDate)}</td></tr>
                <tr><th>Amount received</th><td>{formatINR(receipt.payment.amountPaise)}</td></tr>
                <tr><th>Method</th><td>{METHOD_LABEL[receipt.payment.method]}</td></tr>
                <tr><th>Reference</th><td>{receipt.payment.reference || '—'}</td></tr>
                <tr>
                  <th>Allocated to</th>
                  <td>{receipt.allocations.map(({ charge, amountPaise }) => `${charge.chargeType} ${formatMonth(charge.period)} ${formatINR(amountPaise)}`).join('; ') || 'Unallocated credit'}</td>
                </tr>
              </tbody>
            </table>
          </>
        )}
      </section>

      <Modal
        open={payOpen}
        title="Record payment"
        onClose={() => setPayOpen(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setPayOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button variant="primary" onClick={() => void savePayment()} busy={busy}>
              Save payment
            </Button>
          </>
        }
      >
        <form
          className="space-y-4"
          onSubmit={(e: FormEvent) => {
            e.preventDefault()
            void savePayment()
          }}
        >
          <Select
            label="Tenant"
            required
            value={payForm.tenantId}
            onChange={(e) => setPayForm((f) => ({ ...f, tenantId: e.target.value }))}
          >
            <option value="">Choose a tenant…</option>
            {workspace.tenants.map((tenant) => (
              <option key={tenant.id} value={tenant.id} disabled={!tenant.isActive}>
                {tenant.name} · Room {tenant.roomNumber}
                {!tenant.isActive ? ' (inactive)' : ''}
              </option>
            ))}
          </Select>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              label="Amount (₹)"
              required
              inputMode="decimal"
              placeholder="5000.00"
              value={payForm.amount}
              onChange={(e) => setPayForm((f) => ({ ...f, amount: e.target.value }))}
            />
            <Input
              label="Payment date"
              type="date"
              required
              value={payForm.paymentDate}
              onChange={(e) => setPayForm((f) => ({ ...f, paymentDate: e.target.value }))}
            />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Select
              label="Method"
              value={payForm.method}
              onChange={(e) => setPayForm((f) => ({ ...f, method: e.target.value as PaymentMethod }))}
            >
              {Object.entries(METHOD_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
            <Input
              label="Reference"
              value={payForm.reference}
              onChange={(e) => setPayForm((f) => ({ ...f, reference: e.target.value }))}
              hint="UPI transaction id, cheque number…"
            />
          </div>
          <Textarea
            label="Notes"
            value={payForm.notes}
            onChange={(e) => setPayForm((f) => ({ ...f, notes: e.target.value }))}
          />
          <InlineNotice>
            The amount is applied to the oldest unpaid charges first (rent and electricity alike).
            Anything left over stays as an unallocated credit on the tenant's balance.
          </InlineNotice>
          {formError && <InlineNotice tone="danger" title="Could not save">{formError}</InlineNotice>}
          <button type="submit" className="sr-only">
            Submit
          </button>
        </form>
      </Modal>

      <Modal
        open={chargeOpen}
        title="Add other charge or credit"
        onClose={() => setChargeOpen(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setChargeOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button variant="primary" onClick={() => void saveCharge()} busy={busy}>
              Save
            </Button>
          </>
        }
      >
        <form
          className="space-y-4"
          onSubmit={(e: FormEvent) => {
            e.preventDefault()
            void saveCharge()
          }}
        >
          <Select
            label="Tenant"
            required
            value={chargeForm.tenantId}
            onChange={(e) => setChargeForm((f) => ({ ...f, tenantId: e.target.value }))}
          >
            <option value="">Choose a tenant…</option>
            {workspace.tenants.map((tenant) => (
              <option key={tenant.id} value={tenant.id}>
                {tenant.name} · Room {tenant.roomNumber}
              </option>
            ))}
          </Select>
          <Select
            label="Type"
            value={chargeForm.chargeType}
            onChange={(e) => setChargeForm((f) => ({ ...f, chargeType: e.target.value as ChargeType }))}
          >
            <option value="other">Other charge (adds to balance)</option>
            <option value="credit">Credit (reduces balance)</option>
          </Select>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              label="Amount (₹)"
              required
              inputMode="decimal"
              value={chargeForm.amount}
              onChange={(e) => setChargeForm((f) => ({ ...f, amount: e.target.value }))}
              hint={chargeForm.chargeType === 'credit' ? 'Entered as a positive number, stored as a credit.' : undefined}
            />
            <Input
              label="Date"
              type="date"
              required
              value={chargeForm.chargeDate}
              onChange={(e) => setChargeForm((f) => ({ ...f, chargeDate: e.target.value }))}
            />
          </div>
          <Input
            label="Description"
            required
            value={chargeForm.description}
            onChange={(e) => setChargeForm((f) => ({ ...f, description: e.target.value }))}
            placeholder="Plumbing repair / festival discount…"
          />
          {formError && <InlineNotice tone="danger" title="Could not save">{formError}</InlineNotice>}
          <button type="submit" className="sr-only">
            Submit
          </button>
        </form>
      </Modal>

      <ConfirmDialog
        open={toDeletePayment !== null}
        title="Delete payment?"
        danger
        confirmLabel="Delete payment"
        onCancel={() => setToDeletePayment(null)}
        onConfirm={() => void confirmDeletePayment()}
        message="Deleting a payment releases every allocation made from it and increases outstanding balances again. Statements for the affected months are recalculated."
      />

      <ConfirmDialog
        open={toDeleteCharge !== null}
        title="Delete charge?"
        danger
        confirmLabel="Delete charge"
        onCancel={() => setToDeleteCharge(null)}
        onConfirm={() => void confirmDeleteCharge()}
        message="Deleting a charge that has payments allocated against it is blocked. Delete the payment first."
      />
    </>
  )
}
