import { useMemo, useState, type FormEvent } from 'react'
import { useStore } from '../app/AppState'
import { useDebounced } from '../app/hooks'
import { useWorkspace } from '../app/useWorkspace'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Card, CardHeader, PageHeader } from '../components/ui/Card'
import { Input, Select, Textarea } from '../components/ui/Field'
import { ConfirmDialog, Modal } from '../components/ui/Modal'
import { EmptyState, ErrorState, InlineNotice, LoadingBlock } from '../components/ui/States'
import { TableWrap, Td, Th, Tr } from '../components/ui/Table'
import { formatINR, paiseToInputValue } from '../lib/money'
import { formatDate, todayISO } from '../lib/dates'
import { parseRupees, validatePhone, type FieldErrors } from '../lib/validation'
import { normalizeIndianPhone } from '../lib/phone'
import { useToast } from '../app/Toast'
import type { Tenant, TenantInput } from '../data/types'

interface FormState {
  name: string
  roomNumber: string
  phone: string
  rent: string
  moveInDate: string
  isActive: boolean
  notes: string
}

const emptyForm: FormState = {
  name: '',
  roomNumber: '',
  phone: '',
  rent: '',
  moveInDate: todayISO(),
  isActive: true,
  notes: '',
}

function toForm(tenant: Tenant): FormState {
  return {
    name: tenant.name,
    roomNumber: tenant.roomNumber,
    phone: tenant.phone ?? '',
    rent: paiseToInputValue(tenant.monthlyRentPaise),
    moveInDate: tenant.moveInDate ?? '',
    isActive: tenant.isActive,
    notes: tenant.notes ?? '',
  }
}

type FormKey = keyof FormState

function displayPhone(phone: string | null): string {
  if (!phone) return 'Not saved'
  const normalized = normalizeIndianPhone(phone)
  return normalized.ok ? normalized.display : phone
}

function validate(form: FormState): FieldErrors<FormKey> {
  const errors: FieldErrors<FormKey> = {}
  if (!form.name.trim()) errors.name = 'Name is required'
  if (!form.roomNumber.trim()) errors.roomNumber = 'Room number is required'
  const rent = parseRupees(form.rent, 'Monthly rent', { allowZero: false })
  if (!rent.ok) errors.rent = rent.error
  const phoneError = validatePhone(form.phone)
  if (phoneError) errors.phone = phoneError
  if (form.moveInDate && !/^\d{4}-\d{2}-\d{2}$/.test(form.moveInDate)) {
    errors.moveInDate = 'Move-in date must be YYYY-MM-DD'
  }
  return errors
}

export function TenantsPage() {
  const store = useStore()
  const toast = useToast()
  const workspace = useWorkspace()
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('active')
  const debounced = useDebounced(query)
  const [editing, setEditing] = useState<Tenant | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [open, setOpen] = useState(false)
  const [errors, setErrors] = useState<FieldErrors<FormKey>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [toDelete, setToDelete] = useState<Tenant | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const tenants = workspace.tenants

  const filtered = useMemo(() => {
    const q = debounced.trim().toLowerCase()
    return tenants.filter((tenant) => {
      if (statusFilter === 'active' && !tenant.isActive) return false
      if (statusFilter === 'inactive' && tenant.isActive) return false
      if (!q) return true
      return (
        tenant.name.toLowerCase().includes(q) ||
        tenant.roomNumber.toLowerCase().includes(q) ||
        (tenant.phone ?? '').includes(q)
      )
    })
  }, [tenants, debounced, statusFilter])

  const openCreate = () => {
    setEditing(null)
    setForm({ ...emptyForm })
    setErrors({})
    setFormError(null)
    setOpen(true)
  }

  const openEdit = (tenant: Tenant) => {
    setEditing(tenant)
    setForm(toForm(tenant))
    setErrors({})
    setFormError(null)
    setOpen(true)
  }

  const set = (key: FormKey, value: string | boolean) => setForm((f) => ({ ...f, [key]: value }))

  const save = async () => {
    const found = validate(form)
    setErrors(found)
    if (Object.values(found).some(Boolean)) return

    setBusy(true)
    setFormError(null)
    try {
      const rent = parseRupees(form.rent, 'Monthly rent')
      if (!rent.ok) throw new Error(rent.error)
      const payload: TenantInput = {
        name: form.name.trim(),
        roomNumber: form.roomNumber.trim(),
        phone: form.phone.trim() ? form.phone.trim() : null,
        monthlyRentPaise: rent.paise,
        moveInDate: form.moveInDate || null,
        isActive: form.isActive,
        notes: form.notes.trim() ? form.notes.trim() : null,
      }
      if (editing) await store.updateTenant(editing.id, payload)
      else await store.createTenant(payload)
      toast.success(editing ? 'Tenant updated' : 'Tenant added')
      setOpen(false)
      workspace.reload()
    } catch (error) {
      setFormError(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    void save()
  }

  const toggleActive = async (tenant: Tenant) => {
    try {
      await store.setTenantActive(tenant.id, !tenant.isActive)
      toast.success(tenant.isActive ? `${tenant.name} deactivated` : `${tenant.name} reactivated`)
      workspace.reload()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    }
  }

  const confirmDelete = async () => {
    if (!toDelete) return
    setDeleteError(null)
    try {
      await store.deleteTenant(toDelete.id)
      toast.success('Tenant deleted')
      setToDelete(null)
      workspace.reload()
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : String(error))
    }
  }

  if (workspace.loading && tenants.length === 0) return <LoadingBlock label="Loading tenants" />
  if (workspace.error) return <ErrorState message={workspace.error} onRetry={workspace.reload} />

  return (
    <>
      <PageHeader
        title="Tenants"
        description="Room, rent and contact details. Phone numbers are optional and never leave this app unless you open WhatsApp."
        actions={
          <Button variant="primary" onClick={openCreate}>
            + Add tenant
          </Button>
        }
      />

      <Card>
        <CardHeader
          title={`${filtered.length} tenant${filtered.length === 1 ? '' : 's'}`}
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <Input
                label="Search"
                type="search"
                placeholder="Name, room or phone"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="w-56"
                hint={undefined}
              />
              <Select
                label="Show"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as 'all' | 'active' | 'inactive')}
                className="w-36"
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="all">All</option>
              </Select>
            </div>
          }
        />
        {filtered.length === 0 ? (
          <EmptyState
            title={tenants.length === 0 ? 'No tenants yet' : 'No tenants match the filters'}
            description={
              tenants.length === 0
                ? 'Add your first tenant to start generating monthly statements.'
                : 'Adjust the search or status filter.'
            }
            action={
              tenants.length === 0 ? (
                <Button variant="primary" onClick={openCreate}>
                  + Add tenant
                </Button>
              ) : undefined
            }
          />
        ) : (
          <TableWrap>
            <thead>
              <Tr>
                <Th>Name</Th>
                <Th>Room</Th>
                <Th>Phone</Th>
                <Th align="right">Monthly rent</Th>
                <Th>Move-in</Th>
                <Th>Status</Th>
                <Th align="right">Actions</Th>
              </Tr>
            </thead>
            <tbody>
              {filtered.map((tenant) => (
                <Tr key={tenant.id}>
                  <Td className="font-medium text-slate-900">{tenant.name}</Td>
                  <Td>{tenant.roomNumber}</Td>
                  <Td className="num">
                    {tenant.phone ? displayPhone(tenant.phone) : <span className="text-slate-400">{displayPhone(null)}</span>}
                  </Td>
                  <Td align="right" className="num">
                    {formatINR(tenant.monthlyRentPaise)}
                  </Td>
                  <Td>{formatDate(tenant.moveInDate) || '—'}</Td>
                  <Td>
                    <Badge tone={tenant.isActive ? 'green' : 'slate'}>
                      {tenant.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                  </Td>
                  <Td align="right">
                    <div className="flex justify-end gap-1.5">
                      <Button size="sm" onClick={() => openEdit(tenant)}>
                        Edit
                      </Button>
                      <Button size="sm" onClick={() => void toggleActive(tenant)}>
                        {tenant.isActive ? 'Deactivate' : 'Reactivate'}
                      </Button>
                      <Button size="sm" variant="danger" onClick={() => { setToDelete(tenant); setDeleteError(null) }}>
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
        title={editing ? `Edit ${editing.name}` : 'Add tenant'}
        onClose={() => setOpen(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button variant="primary" onClick={() => void save()} busy={busy}>
              {editing ? 'Save changes' : 'Add tenant'}
            </Button>
          </>
        }
      >
        <form className="space-y-4" onSubmit={(e) => void submit(e)}>
          <Input
            label="Tenant name"
            required
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
            error={errors.name}
          />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              label="Room number"
              required
              value={form.roomNumber}
              onChange={(e) => set('roomNumber', e.target.value)}
              error={errors.roomNumber}
            />
            <Input
              label="Phone (optional)"
              inputMode="tel"
              placeholder="98765 43210"
              value={form.phone}
              onChange={(e) => set('phone', e.target.value)}
              error={errors.phone}
              hint="Used for WhatsApp click-to-chat. Stored in international digits only."
            />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              label="Monthly rent (₹)"
              required
              inputMode="decimal"
              placeholder="8500.00"
              value={form.rent}
              onChange={(e) => set('rent', e.target.value)}
              error={errors.rent}
            />
            <Input
              label="Move-in date"
              type="date"
              value={form.moveInDate}
              onChange={(e) => set('moveInDate', e.target.value)}
              error={errors.moveInDate}
            />
          </div>
          <Select
            label="Status"
            value={form.isActive ? 'active' : 'inactive'}
            onChange={(e) => set('isActive', e.target.value === 'active')}
          >
            <option value="active">Active</option>
            <option value="inactive">Inactive (kept for history)</option>
          </Select>
          <Textarea
            label="Notes"
            value={form.notes}
            onChange={(e) => set('notes', e.target.value)}
            placeholder="Anything worth remembering"
          />
          {formError && (
            <InlineNotice tone="danger" title="Could not save">
              {formError}
            </InlineNotice>
          )}
          {/* Hidden submit so Enter key works inside the form. */}
          <button type="submit" className="sr-only">
            Submit
          </button>
        </form>
      </Modal>

      <ConfirmDialog
        open={toDelete !== null}
        title="Delete tenant?"
        danger
        confirmLabel="Delete"
        onCancel={() => setToDelete(null)}
        onConfirm={() => void confirmDelete()}
        message={
          <div className="space-y-2">
            <p>
              This permanently removes <strong>{toDelete?.name}</strong>. Only tenants with no
              recorded charges or payments can be deleted; otherwise deactivate instead so past
              statements stay auditable.
            </p>
            {deleteError && <InlineNotice tone="danger">{deleteError}</InlineNotice>}
          </div>
        }
      />
    </>
  )
}
