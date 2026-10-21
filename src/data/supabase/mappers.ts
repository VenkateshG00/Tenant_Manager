/** Row ↔ domain mappers. Decimal money columns arrive as strings. */

import { toPaise, paiseToDecimalString } from '../../lib/money'
import type { Charge, ChargeType, Payment, PaymentMethod } from '../../lib/ledger'
import type {
  Allocation, AuditLog, Bill, BillSource, BillStatus, Meter,
  MeterArrangement, ReminderLog, ReminderStatus, Tenant,
} from '../types'
import type {
  AllocationDbRow, AssignmentRow as AssignmentDbRow, AuditRow, BillRow,
  ChargeRow, MeterRow, PaymentRow, ReminderRow, TenantRow,
} from './rows'

export function mapTenant(row: TenantRow): Tenant {
  return {
    id: row.id,
    name: row.name,
    roomNumber: row.room_number,
    phone: row.phone,
    monthlyRentPaise: toPaise(row.monthly_rent),
    moveInDate: row.move_in_date,
    isActive: row.is_active,
    notes: row.notes,
    createdAt: row.created_at,
  }
}

export function mapMeter(row: MeterRow, assignments: AssignmentDbRow[]): Meter {
  return {
    id: row.id,
    meterCode: row.meter_code,
    uscNumber: row.usc_number,
    roomLabel: row.room_label,
    arrangement: row.arrangement as MeterArrangement,
    isActive: row.is_active,
    notes: row.notes,
    createdAt: row.created_at,
    assignments: assignments.map((a) => ({
      id: a.id,
      meterId: a.meter_id,
      tenantId: a.tenant_id,
      allocationWeight: a.allocation_weight,
      notes: a.notes,
    })),
  }
}

export function mapBill(row: BillRow): Bill {
  return {
    id: row.id,
    meterId: row.meter_id,
    billingMonth: row.billing_month,
    amountPaise: toPaise(row.amount),
    billGeneratedAt: row.bill_generated_at,
    dueDate: row.due_date,
    billReference: row.bill_reference,
    receiptUrl: row.receipt_url,
    status: row.status as BillStatus,
    source: row.source as BillSource,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function mapCharge(row: ChargeRow): Charge {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    chargeType: row.charge_type as ChargeType,
    period: row.period,
    chargeDate: row.charge_date,
    amountPaise: toPaise(row.amount),
    description: row.description,
    sourceId: row.source_id,
    createdAt: row.created_at,
  }
}

export function mapPayment(row: PaymentRow): Payment {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    paymentDate: row.payment_date,
    amountPaise: toPaise(row.amount),
    method: row.method as PaymentMethod,
    reference: row.reference,
    notes: row.notes,
    createdAt: row.created_at,
  }
}

export function mapAllocation(row: AllocationDbRow): Allocation {
  return {
    paymentId: row.payment_id,
    chargeId: row.charge_id,
    amountPaise: toPaise(row.amount),
  }
}

export function mapReminder(row: ReminderRow): ReminderLog {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    period: row.period,
    status: row.status as ReminderStatus,
    channel: row.channel,
    message: row.message,
    phoneDigits: row.phone_digits,
    createdAt: row.created_at,
  }
}

export function mapAudit(row: AuditRow): AuditLog {
  return {
    id: row.id,
    entityType: row.entity_type,
    entityId: row.entity_id,
    action: row.action,
    before: row.before_data,
    after: row.after_data,
    createdAt: row.created_at,
  }
}

export { paiseToDecimalString }
