/**
 * In-memory store used when no Supabase project is configured.
 * Every record it holds is fictional sample data — the UI shows a permanent
 * "DEMO MODE" banner so it can never be confused with real financial data.
 */

import { todayISO, currentMonthKey, previousMonthKey } from '../../lib/dates'
import { allocateFIFO } from '../../lib/ledger'
import { toPaise } from '../../lib/money'
import { planElectricityCharges, planPaymentAllocations } from '../planner'
import type { AppStore, ReminderLogInput } from '../store'
import type {
  Allocation,
  AuditLog,
  Bill,
  BillInput,
  BillStatus,
  Charge,
  ChargeInput,
  Meter,
  MeterInput,
  Payment,
  PaymentInput,
  ReminderLog,
  Tenant,
  TenantInput,
  AssignmentInput,
} from '../types'

let seq = 0
function uid(prefix: string): string {
  seq += 1
  return `${prefix}-demo-${String(seq).padStart(4, '0')}`
}

const nowIso = () => new Date().toISOString()

function seedData(): {
  tenants: Tenant[]
  meters: Meter[]
  bills: Bill[]
  charges: Charge[]
  payments: Payment[]
  allocations: Allocation[]
  reminders: ReminderLog[]
  audits: AuditLog[]
} {
  const created = '2026-01-01T00:00:00.000Z'
  const current = currentMonthKey()
  const prev = previousMonthKey(current)

  const tenants: Tenant[] = [
    {
      id: 't-demo-1', name: 'Sample Tenant A', roomNumber: '101', phone: '9876543210',
      monthlyRentPaise: toPaise('8500'), moveInDate: '2025-01-15', isActive: true,
      notes: 'Sample data — not a real tenant', createdAt: created,
    },
    {
      id: 't-demo-2', name: 'Sample Tenant B', roomNumber: '102', phone: '9812345678',
      monthlyRentPaise: toPaise('9000'), moveInDate: '2025-03-01', isActive: true,
      notes: null, createdAt: created,
    },
    {
      id: 't-demo-3', name: 'Sample Tenant C', roomNumber: '201', phone: null,
      monthlyRentPaise: toPaise('8000'), moveInDate: '2024-11-05', isActive: true,
      notes: 'No phone number saved', createdAt: created,
    },
  ]

  const mkAssignment = (meterId: string, tenantId: string, weight: number): AssignmentRowShape => ({
    id: uid('asg'), meterId, tenantId, allocationWeight: weight, notes: null,
  })

  const meters: Meter[] = [
    {
      id: 'm-demo-1', meterCode: 'M1', uscNumber: 'DEMO-USC-000001', roomLabel: '101',
      arrangement: 'individual', isActive: true, notes: 'Sample data', createdAt: created,
      assignments: [mkAssignment('m-demo-1', 't-demo-1', 1)],
    },
    {
      id: 'm-demo-2', meterCode: 'M2', uscNumber: 'DEMO-USC-000002', roomLabel: '102',
      arrangement: 'individual', isActive: true, notes: null, createdAt: created,
      assignments: [mkAssignment('m-demo-2', 't-demo-2', 1)],
    },
    {
      id: 'm-demo-3', meterCode: 'M3', uscNumber: 'DEMO-USC-000003', roomLabel: '201',
      arrangement: 'individual', isActive: true, notes: null, createdAt: created,
      assignments: [mkAssignment('m-demo-3', 't-demo-3', 1)],
    },
    {
      id: 'm-demo-4', meterCode: 'M4', uscNumber: 'DEMO-USC-000004', roomLabel: 'Common corridor',
      arrangement: 'shared', isActive: true,
      notes: 'Shared meter — split evenly between rooms 101 and 102', createdAt: created,
      assignments: [
        mkAssignment('m-demo-4', 't-demo-1', 1),
        mkAssignment('m-demo-4', 't-demo-2', 1),
      ],
    },
    {
      id: 'm-demo-5', meterCode: 'M5', uscNumber: 'DEMO-USC-000005', roomLabel: '202',
      arrangement: 'individual', isActive: false, notes: 'Vacant room — meter inactive', createdAt: created,
      assignments: [],
    },
    {
      id: 'm-demo-6', meterCode: 'M6', uscNumber: 'DEMO-USC-000006', roomLabel: 'Shop front',
      arrangement: 'individual', isActive: true, notes: null, createdAt: created,
      assignments: [],
    },
  ]

  const bills: Bill[] = []
  const charges: Charge[] = []
  const payments: Payment[] = []
  const allocations: Allocation[] = []

  const months = [prev, current]
  for (const month of months) {
    for (const tenant of tenants) {
      charges.push({
        id: uid('chg'), tenantId: tenant.id, chargeType: 'rent', period: month,
        chargeDate: `${month}-01`, amountPaise: tenant.monthlyRentPaise,
        description: `Monthly rent for ${month}`, sourceId: null, createdAt: created,
      })
    }
  }

  for (const month of months) {
    for (const meter of meters.filter((m) => m.isActive && m.assignments.length > 0)) {
      const amount = meter.meterCode === 'M4' ? toPaise('320') : toPaise('480')
      const bill: Bill = {
        id: uid('bill'), meterId: meter.id, billingMonth: month, amountPaise: amount,
        billGeneratedAt: `${month}-05`, dueDate: `${month}-20`, billReference: `REF-${meter.meterCode}-${month}`,
        receiptUrl: null, status: 'verified', source: 'manual_entry',
        notes: 'Sample bill — verify against the official TGNPDCL page',
        createdAt: created, updatedAt: created, hasCharges: true,
      }
      bills.push(bill)
      for (const charge of planElectricityCharges(bill, meter, tenants)) {
        charges.push({ ...charge, id: uid('chg'), createdAt: created })
      }
    }
  }

  // Previous month: Tenant A fully paid, Tenant B partially, Tenant C nothing.
  const payA: Payment = {
    id: uid('pay'), tenantId: 't-demo-1', paymentDate: `${prev}-10`,
    amountPaise: toPaise('9000'), method: 'upi', reference: 'UPI-SAMPLE-1',
    notes: 'Sample payment', createdAt: created,
  }
  payments.push(payA)
  for (const a of allocateFIFO(charges.filter((c) => c.tenantId === 't-demo-1'), [payA])) {
    allocations.push({ ...a })
  }

  const payB: Payment = {
    id: uid('pay'), tenantId: 't-demo-2', paymentDate: `${prev}-12`,
    amountPaise: toPaise('5000'), method: 'cash', reference: null,
    notes: 'Sample partial payment', createdAt: created,
  }
  payments.push(payB)
  for (const a of allocateFIFO(charges.filter((c) => c.tenantId === 't-demo-2'), [payB])) {
    allocations.push({ ...a })
  }

  // Current month: Tenant A already cleared everything.
  const payA2: Payment = {
    id: uid('pay'), tenantId: 't-demo-1', paymentDate: todayISO(),
    amountPaise: toPaise('9000'), method: 'upi', reference: 'UPI-SAMPLE-2',
    notes: null, createdAt: created,
  }
  payments.push(payA2)
  for (const a of allocateFIFO(charges.filter((c) => c.tenantId === 't-demo-1'), [payA2])) {
    allocations.push({ ...a })
  }

  const reminders: ReminderLog[] = []

  return { tenants, meters, bills, charges, payments, allocations, reminders, audits: [] }
}

type AssignmentRowShape = Meter['assignments'][number]

export class DemoStore implements AppStore {
  readonly mode = 'demo' as const

  private tenants: Tenant[]
  private meters: Meter[]
  private bills: Bill[]
  private charges: Charge[]
  private payments: Payment[]
  private allocations: Allocation[]
  private reminders: ReminderLog[]
  private audits: AuditLog[]

  constructor() {
    const seed = seedData()
    this.tenants = seed.tenants
    this.meters = seed.meters
    this.bills = seed.bills
    this.charges = seed.charges
    this.payments = seed.payments
    this.allocations = seed.allocations
    this.reminders = seed.reminders
    this.audits = seed.audits
  }

  private audit(entityType: string, entityId: string | null, action: string, before: unknown, after: unknown): void {
    this.audits.unshift({
      id: uid('aud'), entityType, entityId, action, before, after, createdAt: nowIso(),
    })
  }

  async ping(): Promise<void> {
    await Promise.resolve()
  }

  // ---- tenants ------------------------------------------------------------
  async listTenants(): Promise<Tenant[]> {
    return [...this.tenants].sort((a, b) => a.roomNumber.localeCompare(b.roomNumber))
  }

  async createTenant(input: TenantInput): Promise<Tenant> {
    const tenant: Tenant = { id: uid('t'), ...input, createdAt: nowIso() }
    this.tenants.push(tenant)
    this.audit('tenant', tenant.id, 'create', null, tenant)
    return tenant
  }

  async updateTenant(id: string, patch: Partial<TenantInput>): Promise<void> {
    const tenant = this.tenants.find((t) => t.id === id)
    if (!tenant) throw new Error('Tenant not found')
    const before = { ...tenant }
    Object.assign(tenant, patch)
    this.audit('tenant', id, 'update', before, tenant)
  }

  async setTenantActive(id: string, isActive: boolean): Promise<void> {
    await this.updateTenant(id, { isActive })
  }

  async deleteTenant(id: string): Promise<void> {
    const hasHistory =
      this.charges.some((c) => c.tenantId === id) || this.payments.some((p) => p.tenantId === id)
    if (hasHistory) {
      throw new Error(
        'This tenant has billing history. Deactivate it instead so past statements stay auditable.',
      )
    }
    const before = this.tenants.find((t) => t.id === id) ?? null
    this.tenants = this.tenants.filter((t) => t.id !== id)
    this.meters.forEach((m) => {
      m.assignments = m.assignments.filter((a) => a.tenantId !== id)
    })
    this.audit('tenant', id, 'delete', before, null)
  }

  // ---- meters -------------------------------------------------------------
  async listMeters(): Promise<Meter[]> {
    return [...this.meters].sort((a, b) => a.meterCode.localeCompare(b.meterCode))
  }

  async createMeter(input: MeterInput, assignments: AssignmentInput[]): Promise<Meter> {
    if (this.meters.some((m) => m.meterCode.toLowerCase() === input.meterCode.toLowerCase())) {
      throw new Error(`Meter code ${input.meterCode} already exists`)
    }
    if (this.meters.some((m) => m.uscNumber === input.uscNumber)) {
      throw new Error(`USC ${input.uscNumber} is already registered`)
    }
    const meter: Meter = {
      id: uid('m'), ...input, createdAt: nowIso(),
      assignments: assignments.map((a) => ({
        id: uid('asg'), meterId: '', tenantId: a.tenantId,
        allocationWeight: a.allocationWeight, notes: a.notes ?? null,
      })),
    }
    meter.assignments.forEach((a) => { a.meterId = meter.id })
    this.meters.push(meter)
    this.audit('meter', meter.id, 'create', null, meter)
    return meter
  }

  async updateMeter(id: string, patch: Partial<MeterInput>): Promise<void> {
    const meter = this.meters.find((m) => m.id === id)
    if (!meter) throw new Error('Meter not found')
    if (patch.meterCode && this.meters.some((m) => m.id !== id && m.meterCode.toLowerCase() === patch.meterCode!.toLowerCase())) {
      throw new Error(`Meter code ${patch.meterCode} already exists`)
    }
    if (patch.uscNumber && this.meters.some((m) => m.id !== id && m.uscNumber === patch.uscNumber)) {
      throw new Error(`USC ${patch.uscNumber} is already registered`)
    }
    const before = { ...meter }
    Object.assign(meter, patch)
    this.audit('meter', id, 'update', before, meter)
  }

  async setMeterAssignments(meterId: string, assignments: AssignmentInput[]): Promise<void> {
    const meter = this.meters.find((m) => m.id === meterId)
    if (!meter) throw new Error('Meter not found')
    const before = meter.assignments
    meter.assignments = assignments.map((a) => ({
      id: uid('asg'), meterId, tenantId: a.tenantId,
      allocationWeight: a.allocationWeight, notes: a.notes ?? null,
    }))
    this.audit('meter_assignment', meterId, 'replace', before, meter.assignments)
  }

  async deleteMeter(id: string): Promise<void> {
    const used = this.bills.some((b) => b.meterId === id)
    if (used) {
      throw new Error('This meter has recorded bills. Deactivate it instead so history stays intact.')
    }
    const before = this.meters.find((m) => m.id === id) ?? null
    this.meters = this.meters.filter((m) => m.id !== id)
    this.audit('meter', id, 'delete', before, null)
  }

  // ---- bills --------------------------------------------------------------
  async listBills(): Promise<Bill[]> {
    const meterById = new Map(this.meters.map((m) => [m.id, m]))
    return [...this.bills]
      .sort((a, b) => (a.billingMonth < b.billingMonth ? 1 : a.billingMonth > b.billingMonth ? -1 : 0))
      .map((b) => ({
        ...b,
        meter: meterById.get(b.meterId),
        hasCharges: this.charges.some((c) => c.sourceId === b.id),
      }))
  }

  async createBill(input: BillInput): Promise<Bill> {
    if (this.bills.some((b) => b.meterId === input.meterId && b.billingMonth === input.billingMonth)) {
      const meter = this.meters.find((m) => m.id === input.meterId)
      throw new Error(
        `A ${input.billingMonth} bill already exists for meter ${meter?.meterCode ?? input.meterId}. Edit that bill instead of adding a duplicate.`,
      )
    }
    const bill: Bill = { id: uid('bill'), ...input, createdAt: nowIso(), updatedAt: nowIso() }
    this.bills.push(bill)
    this.audit('bill', bill.id, 'create', null, bill)
    return bill
  }

  async updateBill(id: string, patch: Partial<BillInput>): Promise<void> {
    const bill = this.bills.find((b) => b.id === id)
    if (!bill) throw new Error('Bill not found')
    if (
      patch.meterId && patch.billingMonth &&
      this.bills.some((b) => b.id !== id && b.meterId === patch.meterId && b.billingMonth === patch.billingMonth)
    ) {
      throw new Error('Another bill already exists for that meter and month')
    }
    const before = { ...bill }
    Object.assign(bill, patch, { updatedAt: nowIso() })
    this.audit('bill', id, 'update', before, bill)
    // Keep already-created charges in step with an amended amount.
    if (patch.amountPaise !== undefined || patch.billGeneratedAt !== undefined) {
      for (const charge of this.charges.filter((c) => c.sourceId === id)) {
        const meter = this.meters.find((m) => m.id === bill.meterId)
        if (!meter) continue
        const planned = planElectricityCharges(bill, meter, this.tenants)
        const match = planned.find((p) => p.tenantId === charge.tenantId)
        if (match) {
          charge.amountPaise = match.amountPaise
          charge.chargeDate = match.chargeDate
          charge.description = match.description
        }
      }
    }
  }

  async setBillStatus(id: string, status: BillStatus): Promise<void> {
    await this.updateBill(id, { status })
  }

  async applyBill(billId: string): Promise<number> {
    const bill = this.bills.find((b) => b.id === billId)
    if (!bill) throw new Error('Bill not found')
    const meter = this.meters.find((m) => m.id === bill.meterId)
    if (!meter) throw new Error('Meter not found')
    const planned = planElectricityCharges(bill, meter, this.tenants)
    let created = 0
    for (const input of planned) {
      const exists = this.charges.some(
        (c) => c.tenantId === input.tenantId && c.chargeType === 'electricity' && c.sourceId === billId,
      )
      if (exists) continue
      this.charges.push({ ...input, id: uid('chg'), createdAt: nowIso() })
      created += 1
    }
    this.audit('bill', billId, 'apply_charges', null, { created })
    return created
  }

  async deleteBill(id: string): Promise<void> {
    const bill = this.bills.find((b) => b.id === id)
    if (!bill) throw new Error('Bill not found')
    const chargeIds = this.charges.filter((c) => c.sourceId === id).map((c) => c.id)
    if (this.allocations.some((a) => chargeIds.includes(a.chargeId))) {
      throw new Error(
        'Payments have already been allocated against this bill. Delete those payments first.',
      )
    }
    this.charges = this.charges.filter((c) => c.sourceId !== id)
    this.bills = this.bills.filter((b) => b.id !== id)
    this.audit('bill', id, 'delete', bill, null)
  }

  // ---- charges / payments -------------------------------------------------
  async listCharges(): Promise<Charge[]> {
    return [...this.charges]
  }

  async listPayments(): Promise<Payment[]> {
    return [...this.payments].sort((a, b) => (a.paymentDate < b.paymentDate ? 1 : -1))
  }

  async listAllocations(): Promise<Allocation[]> {
    return [...this.allocations]
  }

  async ensureRentCharges(period: string): Promise<void> {
    for (const tenant of this.tenants.filter((t) => t.isActive)) {
      const exists = this.charges.some(
        (c) => c.tenantId === tenant.id && c.chargeType === 'rent' && c.period === period,
      )
      if (exists) continue
      this.charges.push({
        id: uid('chg'), tenantId: tenant.id, chargeType: 'rent', period,
        chargeDate: `${period}-01`, amountPaise: tenant.monthlyRentPaise,
        description: `Monthly rent for ${period}`, sourceId: null, createdAt: nowIso(),
      })
    }
    this.audit('charge', null, 'ensure_rent_charges', null, { period })
  }

  async recordPayment(input: PaymentInput): Promise<Payment> {
    if (input.amountPaise <= 0) throw new Error('Payment amount must be positive')
    const payment: Payment = { id: uid('pay'), ...input, createdAt: nowIso() }
    this.payments.push(payment)
    const planned = planPaymentAllocations(
      input.tenantId,
      payment,
      this.charges.filter((c) => c.tenantId === input.tenantId),
    )
    for (const a of planned) this.allocations.push({ ...a, paymentId: payment.id })
    this.audit('payment', payment.id, 'create', null, { payment, allocations: planned })
    return payment
  }

  async deletePayment(id: string): Promise<void> {
    const payment = this.payments.find((p) => p.id === id)
    if (!payment) throw new Error('Payment not found')
    this.allocations = this.allocations.filter((a) => a.paymentId !== id)
    this.payments = this.payments.filter((p) => p.id !== id)
    this.audit('payment', id, 'delete', payment, null)
  }

  async createCharge(input: ChargeInput): Promise<Charge> {
    const dup = this.charges.some(
      (c) =>
        c.tenantId === input.tenantId &&
        c.chargeType === input.chargeType &&
        c.period === input.period &&
        (input.sourceId ? c.sourceId === input.sourceId : c.sourceId === null),
    )
    if (dup) throw new Error('An identical charge already exists for this tenant and month')
    const charge: Charge = { ...input, sourceId: input.sourceId ?? null, id: uid('chg'), createdAt: nowIso() }
    this.charges.push(charge)
    this.audit('charge', charge.id, 'create', null, charge)
    return charge
  }

  async updateCharge(id: string, patch: Partial<ChargeInput>): Promise<void> {
    const charge = this.charges.find((c) => c.id === id)
    if (!charge) throw new Error('Charge not found')
    const before = { ...charge }
    Object.assign(charge, patch)
    this.audit('charge', id, 'update', before, charge)
  }

  async deleteCharge(id: string): Promise<void> {
    if (this.allocations.some((a) => a.chargeId === id)) {
      throw new Error('A payment is allocated against this charge. Delete the payment first.')
    }
    const before = this.charges.find((c) => c.id === id) ?? null
    this.charges = this.charges.filter((c) => c.id !== id)
    this.audit('charge', id, 'delete', before, null)
  }

  // ---- reminders ----------------------------------------------------------
  async listReminderLogs(): Promise<ReminderLog[]> {
    return [...this.reminders].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
  }

  async logReminder(input: ReminderLogInput): Promise<ReminderLog> {
    const log: ReminderLog = { id: uid('rem'), channel: 'whatsapp', ...input, createdAt: nowIso() }
    this.reminders.unshift(log)
    this.audit('reminder', log.id, 'create', null, log)
    return log
  }

  async updateReminderLog(id: string, status: ReminderLog['status']): Promise<void> {
    const log = this.reminders.find((r) => r.id === id)
    if (!log) throw new Error('Reminder not found')
    log.status = status
    this.audit('reminder', id, 'update_status', null, { status })
  }

  async listAuditLogs(): Promise<AuditLog[]> {
    return [...this.audits]
  }
}
