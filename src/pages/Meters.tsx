import { useMemo, useState, type FormEvent } from 'react'
import { useStore } from '../app/AppState'
import { useDebounced } from '../app/hooks'
import { useWorkspace } from '../app/useWorkspace'
import { useToast } from '../app/Toast'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Card, CardHeader, PageHeader } from '../components/ui/Card'
import { Input, Select, Textarea } from '../components/ui/Field'
import { ConfirmDialog, Modal } from '../components/ui/Modal'
import { EmptyState, ErrorState, InlineNotice, LoadingBlock } from '../components/ui/States'
import { TableWrap, Td, Th, Tr } from '../components/ui/Table'
import { defaultBillProvider, lookupUrlWithUsc } from '../lib/bill-provider'
import type { AssignmentInput, Meter, MeterArrangement, MeterInput } from '../data/types'

interface AssignmentDraft {
  tenantId: string
  weight: string
}

interface MeterForm {
  meterCode: string
  uscNumber: string
  roomLabel: string
  arrangement: MeterArrangement
  isActive: boolean
  notes: string
  assignments: AssignmentDraft[]
}

const emptyForm: MeterForm = {
  meterCode: '',
  uscNumber: '',
  roomLabel: '',
  arrangement: 'individual',
  isActive: true,
  notes: '',
  assignments: [],
}

const ARRANGEMENT_LABEL: Record<MeterArrangement, string> = {
  individual: 'Individual',
  shared: 'Shared',
  multi_per_tenant: 'Multiple meters, one tenant',
}

function toForm(meter: Meter): MeterForm {
  return {
    meterCode: meter.meterCode,
    uscNumber: meter.uscNumber,
    roomLabel: meter.roomLabel,
    arrangement: meter.arrangement,
    isActive: meter.isActive,
    notes: meter.notes ?? '',
    assignments: meter.assignments.map((a) => ({ tenantId: a.tenantId, weight: String(a.allocationWeight) })),
  }
}

export function MetersPage() {
  const store = useStore()
  const toast = useToast()
  const workspace = useWorkspace()
  const [query, setQuery] = useState('')
  const debounced = useDebounced(query)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Meter | null>(null)
  const [form, setForm] = useState<MeterForm>(emptyForm)
  const [formError, setFormError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [toDelete, setToDelete] = useState<Meter | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [lookupMeter, setLookupMeter] = useState<Meter | null>(null)

  const tenantById = useMemo(
    () => new Map(workspace.tenants.map((t) => [t.id, t])),
    [workspace.tenants],
  )

  const filtered = useMemo(() => {
    const q = debounced.trim().toLowerCase()
    return workspace.meters.filter((meter) => {
      if (!q) return true
      const tenantNames = meter.assignments
        .map((a) => tenantById.get(a.tenantId)?.name ?? '')
        .join(' ')
      return (
        meter.meterCode.toLowerCase().includes(q) ||
        meter.uscNumber.toLowerCase().includes(q) ||
        meter.roomLabel.toLowerCase().includes(q) ||
        tenantNames.toLowerCase().includes(q)
      )
    })
  }, [workspace.meters, debounced, tenantById])

  const activeTenants = workspace.tenants.filter((t) => t.isActive)

  const openCreate = () => {
    setEditing(null)
    setForm({ ...emptyForm, assignments: [] })
    setFormError(null)
    setOpen(true)
  }

  const openEdit = (meter: Meter) => {
    setEditing(meter)
    setForm(toForm(meter))
    setFormError(null)
    setOpen(true)
  }

  const setAssignment = (index: number, patch: Partial<AssignmentDraft>) => {
    setForm((f) => ({
      ...f,
      assignments: f.assignments.map((a, i) => (i === index ? { ...a, ...patch } : a)),
    }))
  }

  const addAssignment = () => {
    setForm((f) => ({
      ...f,
      assignments: [...f.assignments, { tenantId: activeTenants[0]?.id ?? '', weight: '1' }],
    }))
  }

  const removeAssignment = (index: number) => {
    setForm((f) => ({ ...f, assignments: f.assignments.filter((_, i) => i !== index) }))
  }

  const validate = (): string | null => {
    if (!form.meterCode.trim()) return 'Meter code is required (for example M1)'
    if (!form.uscNumber.trim()) return 'TGNPDCL USC number is required'
    if (!form.roomLabel.trim()) return 'Room or location is required'
    const seen = new Set<string>()
    for (const assignment of form.assignments) {
      if (!assignment.tenantId) return 'Each assignment needs a tenant'
      if (seen.has(assignment.tenantId)) return 'A tenant can only appear once per meter'
      seen.add(assignment.tenantId)
      const weight = Number(assignment.weight)
      if (!Number.isInteger(weight) || weight <= 0) {
        return 'Allocation weights must be positive whole numbers'
      }
    }
    if (form.assignments.length > 1 && form.arrangement === 'individual') {
      return 'A meter with more than one tenant must be marked as shared'
    }
    return null
  }

  const save = async () => {
    const problem = validate()
    if (problem) {
      setFormError(problem)
      return
    }
    setBusy(true)
    setFormError(null)
    try {
      const payload: MeterInput = {
        meterCode: form.meterCode.trim(),
        uscNumber: form.uscNumber.trim(),
        roomLabel: form.roomLabel.trim(),
        arrangement: form.arrangement,
        isActive: form.isActive,
        notes: form.notes.trim() ? form.notes.trim() : null,
      }
      const assignments: AssignmentInput[] = form.assignments.map((a) => ({
        tenantId: a.tenantId,
        allocationWeight: Number(a.weight),
      }))
      if (editing) {
        await store.updateMeter(editing.id, payload)
        await store.setMeterAssignments(editing.id, assignments)
        toast.success('Meter updated')
      } else {
        await store.createMeter(payload, assignments)
        toast.success('Meter added')
      }
      setOpen(false)
      workspace.reload()
    } catch (error) {
      setFormError(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }

  const confirmDelete = async () => {
    if (!toDelete) return
    setDeleteError(null)
    try {
      await store.deleteMeter(toDelete.id)
      toast.success('Meter deleted')
      setToDelete(null)
      workspace.reload()
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : String(error))
    }
  }

  const openLookup = (meter: Meter) => {
    setLookupMeter(meter)
    window.open(lookupUrlWithUsc(meter.uscNumber), '_blank', 'noopener,noreferrer')
  }

  if (workspace.loading) return <LoadingBlock label="Loading meters" />
  if (workspace.error) return <ErrorState message={workspace.error} onRetry={workspace.reload} />

  return (
    <>
      <PageHeader
        title="Electricity meters"
        description="Register each TGNPDCL connection (USC), map it to rooms and tenants, and configure shared-meter allocation rules."
        actions={
          <Button variant="primary" onClick={openCreate}>
            + Add meter
          </Button>
        }
      />

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Card className="p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Total meters</p>
          <p className="num mt-1 text-2xl font-semibold">{workspace.meters.length}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Active</p>
          <p className="num mt-1 text-2xl font-semibold">
            {workspace.meters.filter((m) => m.isActive).length}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Unmapped</p>
          <p className="num mt-1 text-2xl font-semibold text-amber-700">
            {workspace.meters.filter((m) => m.isActive && m.assignments.length === 0).length}
          </p>
        </Card>
      </div>

      <Card>
        <CardHeader
          title={`${filtered.length} meter${filtered.length === 1 ? '' : 's'}`}
          actions={
            <Input
              label="Search"
              type="search"
              placeholder="Code, USC, room or tenant"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-64"
            />
          }
        />
        {filtered.length === 0 ? (
          <EmptyState
            title="No meters registered"
            description="Add the six TGNPDCL connections for this property."
            action={
              <Button variant="primary" onClick={openCreate}>
                + Add meter
              </Button>
            }
          />
        ) : (
          <TableWrap>
            <thead>
              <Tr>
                <Th>Code</Th>
                <Th>USC (service no.)</Th>
                <Th>Room / location</Th>
                <Th>Tenants &amp; allocation</Th>
                <Th>Arrangement</Th>
                <Th>Status</Th>
                <Th align="right">Actions</Th>
              </Tr>
            </thead>
            <tbody>
              {filtered.map((meter) => (
                <Tr key={meter.id}>
                  <Td className="font-medium text-slate-900">{meter.meterCode}</Td>
                  <Td className="num">{meter.uscNumber}</Td>
                  <Td>{meter.roomLabel}</Td>
                  <Td>
                    {meter.assignments.length === 0 ? (
                      <Badge tone="amber" title="No tenant mapping saved">
                        Not mapped
                      </Badge>
                    ) : (
                      <ul className="space-y-0.5">
                        {meter.assignments.map((a) => (
                          <li key={a.id}>
                            {tenantById.get(a.tenantId)?.name ?? 'Unknown tenant'}{' '}
                            <span className="text-xs text-slate-500">(weight {a.allocationWeight})</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </Td>
                  <Td>
                    <Badge tone={meter.arrangement === 'shared' ? 'sky' : 'slate'}>
                      {ARRANGEMENT_LABEL[meter.arrangement]}
                    </Badge>
                  </Td>
                  <Td>
                    <Badge tone={meter.isActive ? 'green' : 'slate'}>
                      {meter.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                  </Td>
                  <Td align="right">
                    <div className="flex flex-wrap justify-end gap-1.5">
                      <Button size="sm" onClick={() => openLookup(meter)}>
                        View official bill
                      </Button>
                      <Button size="sm" onClick={() => openEdit(meter)}>
                        Edit
                      </Button>
                      <Button size="sm" variant="danger" onClick={() => { setToDelete(meter); setDeleteError(null) }}>
                        Delete
                      </Button>
                    </div>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </Card>

      <Modal
        open={open}
        wide
        title={editing ? `Edit ${editing.meterCode}` : 'Add meter'}
        onClose={() => setOpen(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button variant="primary" onClick={() => void save()} busy={busy}>
              {editing ? 'Save changes' : 'Add meter'}
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
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              label="Meter code"
              required
              placeholder="M1"
              value={form.meterCode}
              onChange={(e) => setForm((f) => ({ ...f, meterCode: e.target.value }))}
              hint="Internal label, e.g. M1–M6"
            />
            <Input
              label="TGNPDCL USC number"
              required
              placeholder="Service number from the bill"
              value={form.uscNumber}
              onChange={(e) => setForm((f) => ({ ...f, uscNumber: e.target.value }))}
              hint="Must be unique across the property."
            />
          </div>
          <Input
            label="Room or location"
            required
            placeholder="101 / Common corridor / Shop"
            value={form.roomLabel}
            onChange={(e) => setForm((f) => ({ ...f, roomLabel: e.target.value }))}
          />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Select
              label="Meter arrangement"
              value={form.arrangement}
              onChange={(e) =>
                setForm((f) => ({ ...f, arrangement: e.target.value as MeterArrangement }))
              }
              hint="Shared meters need an explicit allocation rule below."
            >
              <option value="individual">Individual — one tenant</option>
              <option value="shared">Shared — split between tenants</option>
              <option value="multi_per_tenant">Multiple meters, one tenant</option>
            </Select>
            <Select
              label="Status"
              value={form.isActive ? 'active' : 'inactive'}
              onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.value === 'active' }))}
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </Select>
          </div>

          <div className="rounded-lg border border-slate-200 p-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-sm font-medium text-slate-800">Tenant allocation</p>
                <p className="text-xs text-slate-500">
                  Bills for this meter are split by allocation weight. Equal shares = same weight for
                  everyone (1 and 1). A 2:1 split = weights 2 and 1.
                </p>
              </div>
              <Button size="sm" onClick={addAssignment} disabled={activeTenants.length === 0}>
                + Assign tenant
              </Button>
            </div>
            {form.assignments.length === 0 ? (
              <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
                No tenant mapped yet. Bills recorded for this meter cannot be charged to anyone until
                an assignment is saved.
              </p>
            ) : (
              <ul className="mt-3 space-y-2">
                {form.assignments.map((assignment, index) => (
                  <li key={index} className="flex flex-col gap-2 sm:flex-row sm:items-end">
                    <div className="flex-1">
                      <label
                        htmlFor={`assignment-tenant-${index}`}
                        className="mb-1.5 block text-sm font-medium text-slate-700"
                      >
                        Tenant {index + 1}
                      </label>
                      <select
                        id={`assignment-tenant-${index}`}
                        value={assignment.tenantId}
                        onChange={(e) => setAssignment(index, { tenantId: e.target.value })}
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                      >
                        <option value="">Choose a tenant…</option>
                        {activeTenants.map((tenant) => (
                          <option key={tenant.id} value={tenant.id}>
                            {tenant.name} · Room {tenant.roomNumber}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="w-full sm:w-32">
                      <Input
                        label="Weight"
                        inputMode="numeric"
                        value={assignment.weight}
                        onChange={(e) => setAssignment(index, { weight: e.target.value })}
                      />
                    </div>
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() => removeAssignment(index)}
                      aria-label={`Remove assignment ${index + 1}`}
                    >
                      Remove
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <Textarea
            label="Notes"
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
          />

          {formError && <InlineNotice tone="danger" title="Check the form">{formError}</InlineNotice>}
          <button type="submit" className="sr-only">
            Submit
          </button>
        </form>
      </Modal>

      <Modal
        open={lookupMeter !== null}
        title="Open the official TGNPDCL bill page"
        onClose={() => setLookupMeter(null)}
        footer={
          <Button variant="secondary" onClick={() => setLookupMeter(null)}>
            Close
          </Button>
        }
      >
        {lookupMeter && (
          <div className="space-y-3 text-sm text-slate-700">
            <p>
              A new tab should have opened at the official{' '}
              <strong>Know Your Bill (LT)</strong> page for{' '}
              <strong>{defaultBillProvider.name}</strong>.
            </p>
            <div className="rounded-lg bg-slate-50 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Enter this USC on the official page
              </p>
              <p className="num mt-1 text-lg font-semibold text-slate-900">{lookupMeter.uscNumber}</p>
            </div>
            <ol className="list-decimal space-y-1 pl-5">
              {defaultBillProvider.lookupTarget(lookupMeter.uscNumber).instructions.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
            <InlineNotice tone="warning">
              This app does not fetch bills automatically. TGNPDCL does not publish a free
              authorised bill-enquiry API, so the amount must be entered manually and verified
              against the USC before saving.
            </InlineNotice>
            <Button
              variant="secondary"
              onClick={() =>
                window.open(defaultBillProvider.lookupTarget('').url, '_blank', 'noopener,noreferrer')
              }
            >
              Open the official page
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                void navigator.clipboard
                  ?.writeText(lookupMeter.uscNumber)
                  .then(() => toast.success('USC copied'))
              }}
            >
              Copy USC
            </Button>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={toDelete !== null}
        title="Delete meter?"
        danger
        confirmLabel="Delete"
        onCancel={() => setToDelete(null)}
        onConfirm={() => void confirmDelete()}
        message={
          <div className="space-y-2">
            <p>
              This removes <strong>{toDelete?.meterCode}</strong> (USC {toDelete?.uscNumber}). Meters
              with recorded bills cannot be deleted — deactivate them instead.
            </p>
            {deleteError && <InlineNotice tone="danger">{deleteError}</InlineNotice>}
          </div>
        }
      />
    </>
  )
}
