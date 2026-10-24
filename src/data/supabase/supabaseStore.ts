/** Supabase-backed implementation of the AppStore. */

import type { SupabaseClient } from '@supabase/supabase-js'
import { allocateFIFO } from '../../lib/ledger'
import { paiseToDecimalString } from '../../lib/money'
import { todayISO } from '../../lib/dates'
import { planElectricityCharges, planPaymentAllocations } from '../planner'
import type { AppStore, ReminderLogInput } from '../store'
import type {
  Allocation, AuditLog, Bill, BillInput, BillStatus, Charge, ChargeInput,
  Meter, MeterInput, Payment, PaymentInput, ReminderLog, Tenant, TenantInput,
  AssignmentInput,
} from '../types'
import {
  mapAllocation, mapAudit, mapBill, mapCharge, mapMeter, mapPayment, mapReminder,
  mapTenant,
} from './mappers'
import type {
  AllocationDbRow, AssignmentRow as AssignmentDbRow, AuditRow, BillRow,
  ChargeRow, MeterRow, PaymentRow, ReminderRow, TenantRow,
} from './rows'

function fail(message: string): never {
  throw new Error(message)
}

export class SupabaseStore implements AppStore {
  readonly mode = 'supabase' as const

  private readonly client: SupabaseClient

  constructor(client: SupabaseClient) {
    this.client = client
  }

  async ping(): Promise<void> {
    const { error } = await this.client.from('tenants').select('id').limit(1)
    if (error) throw new Error(`Cannot reach Supabase: ${error.message}`)
  }

  // ---- tenants ------------------------------------------------------------
  async listTenants(): Promise<Tenant[]> {
    const { data, error } = await this.client
      .from('tenants').select('*').order('room_number')
    if (error) return fail(error.message)
    return ((data ?? []) as TenantRow[]).map(mapTenant)
  }

  async createTenant(input: TenantInput): Promise<Tenant> {
    const { data, error } = await this.client
      .from('tenants')
      .insert({
        name: input.name,
        room_number: input.roomNumber,
        phone: input.phone,
        monthly_rent: paiseToDecimalString(input.monthlyRentPaise),
        move_in_date: input.moveInDate,
        is_active: input.isActive,
        notes: input.notes,
      })
      .select('*').single()
    if (error) return fail(error.message)
    return mapTenant(data as TenantRow)
  }

  async updateTenant(id: string, patch: Partial<TenantInput>): Promise<void> {
    const row: Record<string, unknown> = {}
    if (patch.name !== undefined) row.name = patch.name
    if (patch.roomNumber !== undefined) row.room_number = patch.roomNumber
    if (patch.phone !== undefined) row.phone = patch.phone
    if (patch.monthlyRentPaise !== undefined) row.monthly_rent = paiseToDecimalString(patch.monthlyRentPaise)
    if (patch.moveInDate !== undefined) row.move_in_date = patch.moveInDate
    if (patch.isActive !== undefined) row.is_active = patch.isActive
    if (patch.notes !== undefined) row.notes = patch.notes
    const { error } = await this.client.from('tenants').update(row).eq('id', id)
    if (error) return fail(error.message)
  }

  async setTenantActive(id: string, isActive: boolean): Promise<void> {
    await this.updateTenant(id, { isActive })
  }

  async deleteTenant(id: string): Promise<void> {
    const { count } = await this.client
      .from('charges').select('id', { count: 'exact', head: true }).eq('tenant_id', id)
    const { count: payCount } = await this.client
      .from('payments').select('id', { count: 'exact', head: true }).eq('tenant_id', id)
    if ((count ?? 0) > 0 || (payCount ?? 0) > 0) {
      throw new Error(
        'This tenant has billing history. Deactivate it instead so past statements stay auditable.',
      )
    }
    const { error } = await this.client.from('tenants').delete().eq('id', id)
    if (error) return fail(error.message)
  }

  // ---- meters -------------------------------------------------------------
  async listMeters(): Promise<Meter[]> {
    const [{ data: meters, error: meterError }, { data: assignments, error: asgError }] =
      await Promise.all([
        this.client.from('electricity_meters').select('*').order('meter_code'),
        this.client.from('meter_tenant_assignments').select('*'),
      ])
    if (meterError) return fail(meterError.message)
    if (asgError) return fail(asgError.message)
    const byMeter = new Map<string, AssignmentDbRow[]>()
    for (const a of (assignments ?? []) as AssignmentDbRow[]) {
      const list = byMeter.get(a.meter_id) ?? []
      list.push(a)
      byMeter.set(a.meter_id, list)
    }
    return ((meters ?? []) as MeterRow[]).map((m) => mapMeter(m, byMeter.get(m.id) ?? []))
  }

  async createMeter(input: MeterInput, assignments: AssignmentInput[]): Promise<Meter> {
    const { data, error } = await this.client
      .from('electricity_meters')
      .insert({
        meter_code: input.meterCode,
        usc_number: input.uscNumber,
        room_label: input.roomLabel,
        arrangement: input.arrangement,
        is_active: input.isActive,
        notes: input.notes,
      })
      .select('*').single()
    if (error) return fail(error.message)
    const meter = data as MeterRow
    if (assignments.length > 0) {
      const { error: asgError } = await this.client.from('meter_tenant_assignments').insert(
        assignments.map((a) => ({
          meter_id: meter.id,
          tenant_id: a.tenantId,
          allocation_weight: a.allocationWeight,
          notes: a.notes ?? null,
        })),
      )
      if (asgError) return fail(asgError.message)
    }
    const list = await this.listMeters()
    return list.find((m) => m.id === meter.id) ?? mapMeter(meter, [])
  }

  async updateMeter(id: string, patch: Partial<MeterInput>): Promise<void> {
    const row: Record<string, unknown> = {}
    if (patch.meterCode !== undefined) row.meter_code = patch.meterCode
    if (patch.uscNumber !== undefined) row.usc_number = patch.uscNumber
    if (patch.roomLabel !== undefined) row.room_label = patch.roomLabel
    if (patch.arrangement !== undefined) row.arrangement = patch.arrangement
    if (patch.isActive !== undefined) row.is_active = patch.isActive
    if (patch.notes !== undefined) row.notes = patch.notes
    const { error } = await this.client.from('electricity_meters').update(row).eq('id', id)
    if (error) return fail(error.message)
  }

  async setMeterAssignments(meterId: string, assignments: AssignmentInput[]): Promise<void> {
    const { error: delError } = await this.client
      .from('meter_tenant_assignments').delete().eq('meter_id', meterId)
    if (delError) return fail(delError.message)
    if (assignments.length === 0) return
    const { error } = await this.client.from('meter_tenant_assignments').insert(
      assignments.map((a) => ({
        meter_id: meterId,
        tenant_id: a.tenantId,
        allocation_weight: a.allocationWeight,
        notes: a.notes ?? null,
      })),
    )
    if (error) return fail(error.message)
  }

  async deleteMeter(id: string): Promise<void> {
    const { count } = await this.client
      .from('electricity_bills').select('id', { count: 'exact', head: true }).eq('meter_id', id)
    if ((count ?? 0) > 0) {
      throw new Error('This meter has recorded bills. Deactivate it instead so history stays intact.')
    }
    const { error } = await this.client.from('electricity_meters').delete().eq('id', id)
    if (error) return fail(error.message)
  }

  // ---- bills --------------------------------------------------------------
  async listBills(): Promise<Bill[]> {
    const [{ data: bills, error }, meters] = await Promise.all([
      this.client.from('electricity_bills').select('*').order('billing_month', { ascending: false }),
      this.listMeters(),
    ])
    if (error) return fail(error.message)
    const meterById = new Map(meters.map((m) => [m.id, m]))
    const rows = (bills ?? []) as BillRow[]
    const mapped = rows.map((row) => {
      const bill = mapBill(row)
      bill.meter = meterById.get(bill.meterId)
      return bill
    })
    const { data: charges, error: chargesError } = await this.client
      .from('charges').select('source_id').not('source_id', 'is', null)
    if (chargesError) return fail(chargesError.message)
    const billIds = new Set((charges ?? []).map((c: { source_id: string }) => c.source_id))
    for (const bill of mapped) bill.hasCharges = billIds.has(bill.id)
    return mapped
  }

  async createBill(input: BillInput): Promise<Bill> {
    const { data, error } = await this.client
      .from('electricity_bills')
      .insert({
        meter_id: input.meterId,
        billing_month: input.billingMonth,
        amount: paiseToDecimalString(input.amountPaise),
        bill_generated_at: input.billGeneratedAt,
        due_date: input.dueDate,
        bill_reference: input.billReference,
        receipt_url: input.receiptUrl,
        status: input.status,
        source: input.source,
        notes: input.notes,
      })
      .select('*').single()
    if (error) {
      if (error.code === '23505') {
        throw new Error('A bill for that meter and billing month already exists. Edit it instead of adding a duplicate.')
      }
      return fail(error.message)
    }
    return mapBill(data as BillRow)
  }

  async updateBill(id: string, patch: Partial<BillInput>): Promise<void> {
    const row: Record<string, unknown> = {}
    if (patch.meterId !== undefined) row.meter_id = patch.meterId
    if (patch.billingMonth !== undefined) row.billing_month = patch.billingMonth
    if (patch.amountPaise !== undefined) row.amount = paiseToDecimalString(patch.amountPaise)
    if (patch.billGeneratedAt !== undefined) row.bill_generated_at = patch.billGeneratedAt
    if (patch.dueDate !== undefined) row.due_date = patch.dueDate
    if (patch.billReference !== undefined) row.bill_reference = patch.billReference
    if (patch.receiptUrl !== undefined) row.receipt_url = patch.receiptUrl
    if (patch.status !== undefined) row.status = patch.status
    if (patch.source !== undefined) row.source = patch.source
    if (patch.notes !== undefined) row.notes = patch.notes
    const { error } = await this.client.from('electricity_bills').update(row).eq('id', id)
    if (error) {
      if (error.code === '23505') {
        throw new Error('Another bill already exists for that meter and billing month')
      }
      return fail(error.message)
    }
    // Keep already-created electricity charges in step with an amended bill.
    if (patch.amountPaise !== undefined || patch.billGeneratedAt !== undefined) {
      const [bills, meters, tenants, charges] = await Promise.all([
        this.listBills(), this.listMeters(), this.listTenants(), this.listCharges(),
      ])
      const bill = bills.find((b) => b.id === id)
      const meter = meters.find((m) => m.id === bill?.meterId)
      if (bill && meter) {
        const planned = planElectricityCharges(bill, meter, tenants)
        for (const existing of charges.filter((c) => c.sourceId === id)) {
          const match = planned.find((p) => p.tenantId === existing.tenantId)
          if (!match) continue
          const { error: chargeError } = await this.client.from('charges').update({
            amount: paiseToDecimalString(match.amountPaise),
            charge_date: match.chargeDate,
            description: match.description,
          }).eq('id', existing.id)
          if (chargeError) {
            throw new Error(
              `Bill was saved, but its electricity charge ${existing.id} could not be synchronized: ${chargeError.message}`,
            )
          }
        }
      }
    }
  }

  async setBillStatus(id: string, status: BillStatus): Promise<void> {
    await this.updateBill(id, { status })
  }

  async applyBill(billId: string): Promise<number> {
    const [bills, meters, tenants, charges] = await Promise.all([
      this.listBills(), this.listMeters(), this.listTenants(), this.listCharges(),
    ])
    const bill = bills.find((b) => b.id === billId)
    if (!bill) throw new Error('Bill not found')
    const meter = meters.find((m) => m.id === bill.meterId)
    if (!meter) throw new Error('Meter not found')
    const planned = planElectricityCharges(bill, meter, tenants).filter(
      (p) => !charges.some((c) => c.sourceId === billId && c.tenantId === p.tenantId),
    )
    if (planned.length === 0) return 0
    const { error } = await this.client.from('charges').insert(
      planned.map((p) => ({
        tenant_id: p.tenantId,
        charge_type: p.chargeType,
        period: p.period,
        charge_date: p.chargeDate,
        amount: paiseToDecimalString(p.amountPaise),
        description: p.description,
        source_id: p.sourceId,
      })),
    )
    if (error) return fail(error.message)
    return planned.length
  }

  async deleteBill(id: string): Promise<void> {
    const { data: chargeRows } = await this.client
      .from('charges').select('id').eq('source_id', id)
    const chargeIds = (chargeRows ?? []).map((c: { id: string }) => c.id)
    if (chargeIds.length > 0) {
      const { count } = await this.client
        .from('payment_allocations')
        .select('id', { count: 'exact', head: true }).in('charge_id', chargeIds)
      if ((count ?? 0) > 0) {
        throw new Error('Payments have already been allocated against this bill. Delete those payments first.')
      }
      const { error: chargeError } = await this.client.from('charges').delete().in('id', chargeIds)
      if (chargeError) return fail(chargeError.message)
    }
    const { error } = await this.client.from('electricity_bills').delete().eq('id', id)
    if (error) return fail(error.message)
  }

  // ---- charges / payments -------------------------------------------------
  async listCharges(): Promise<Charge[]> {
    const { data, error } = await this.client.from('charges').select('*').order('charge_date')
    if (error) return fail(error.message)
    return ((data ?? []) as ChargeRow[]).map(mapCharge)
  }

  async listPayments(): Promise<Payment[]> {
    const { data, error } = await this.client.from('payments').select('*').order('payment_date', { ascending: false })
    if (error) return fail(error.message)
    return ((data ?? []) as PaymentRow[]).map(mapPayment)
  }

  async listAllocations(): Promise<Allocation[]> {
    const { data, error } = await this.client.from('payment_allocations').select('*')
    if (error) return fail(error.message)
    return ((data ?? []) as AllocationDbRow[]).map(mapAllocation)
  }

  async ensureRentCharges(period: string): Promise<void> {
    const { error } = await this.client.rpc('ensure_rent_charges', { p_period: period })
    if (error) return fail(error.message)
  }

  async recordPayment(input: PaymentInput): Promise<Payment> {
    if (input.amountPaise <= 0) throw new Error('Payment amount must be positive')
    const charges = (await this.listCharges()).filter((c) => c.tenantId === input.tenantId)
    const temp: Payment = {
      id: 'pending', tenantId: input.tenantId, paymentDate: input.paymentDate,
      amountPaise: input.amountPaise, method: input.method,
      reference: input.reference, notes: input.notes, createdAt: todayISO(),
    }
    const planned = planPaymentAllocations(input.tenantId, temp, charges)
    const { data, error } = await this.client.rpc('record_payment_with_allocations', {
      p_tenant_id: input.tenantId,
      p_payment_date: input.paymentDate,
      p_amount: paiseToDecimalString(input.amountPaise),
      p_method: input.method,
      p_reference: input.reference,
      p_notes: input.notes,
      p_allocations: planned.map((a) => ({ charge_id: a.chargeId, amount: paiseToDecimalString(a.amountPaise) })),
    })
    if (error) return fail(error.message)
    const id = data as string
    const payments = await this.listPayments()
    const created = payments.find((p) => p.id === id)
    if (!created) throw new Error('Payment saved but could not be re-read')
    return created
  }

  async deletePayment(id: string): Promise<void> {
    const { error } = await this.client.rpc('delete_payment_with_allocations', {
      p_payment_id: id,
    })
    if (error) return fail(error.message)
  }

  async createCharge(input: ChargeInput): Promise<Charge> {
    const { data, error } = await this.client
      .from('charges')
      .insert({
        tenant_id: input.tenantId,
        charge_type: input.chargeType,
        period: input.period,
        charge_date: input.chargeDate,
        amount: paiseToDecimalString(input.amountPaise),
        description: input.description,
        source_id: input.sourceId ?? null,
      })
      .select('*').single()
    if (error) {
      if (error.code === '23505') {
        throw new Error('An identical charge already exists for this tenant and month')
      }
      return fail(error.message)
    }
    return mapCharge(data as ChargeRow)
  }

  async updateCharge(id: string, patch: Partial<ChargeInput>): Promise<void> {
    const row: Record<string, unknown> = {}
    if (patch.chargeType !== undefined) row.charge_type = patch.chargeType
    if (patch.period !== undefined) row.period = patch.period
    if (patch.chargeDate !== undefined) row.charge_date = patch.chargeDate
    if (patch.amountPaise !== undefined) row.amount = paiseToDecimalString(patch.amountPaise)
    if (patch.description !== undefined) row.description = patch.description
    const { error } = await this.client.from('charges').update(row).eq('id', id)
    if (error) return fail(error.message)
  }

  async deleteCharge(id: string): Promise<void> {
    const { count } = await this.client
      .from('payment_allocations').select('id', { count: 'exact', head: true }).eq('charge_id', id)
    if ((count ?? 0) > 0) {
      throw new Error('A payment is allocated against this charge. Delete the payment first.')
    }
    const { error } = await this.client.from('charges').delete().eq('id', id)
    if (error) return fail(error.message)
  }

  // ---- reminders ----------------------------------------------------------
  async listReminderLogs(): Promise<ReminderLog[]> {
    const { data, error } = await this.client.from('reminder_logs').select('*').order('created_at', { ascending: false })
    if (error) return fail(error.message)
    return ((data ?? []) as ReminderRow[]).map(mapReminder)
  }

  async logReminder(input: ReminderLogInput): Promise<ReminderLog> {
    const { data, error } = await this.client
      .from('reminder_logs')
      .insert({
        tenant_id: input.tenantId,
        period: input.period,
        status: input.status,
        channel: 'whatsapp',
        message: input.message,
        phone_digits: input.phoneDigits,
      })
      .select('*').single()
    if (error) return fail(error.message)
    return mapReminder(data as ReminderRow)
  }

  async updateReminderLog(id: string, status: ReminderLog['status']): Promise<void> {
    const { error } = await this.client.from('reminder_logs').update({ status }).eq('id', id)
    if (error) return fail(error.message)
  }

  async listAuditLogs(): Promise<AuditLog[]> {
    const { data, error } = await this.client
      .from('audit_logs').select('*').order('created_at', { ascending: false }).limit(100)
    if (error) return fail(error.message)
    return ((data ?? []) as AuditRow[]).map(mapAudit)
  }
}

/** Re-exported so callers can reuse FIFO planning against Supabase rows. */
export { allocateFIFO }
