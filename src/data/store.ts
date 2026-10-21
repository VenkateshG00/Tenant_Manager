/** Storage contract implemented by both the Supabase store and the demo store. */

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
} from './types'

export interface ReminderLogInput {
  tenantId: string
  period: string
  status: 'prepared' | 'sent' | 'skipped'
  message: string
  phoneDigits: string | null
}

export interface AppStore {
  readonly mode: 'supabase' | 'demo'
  /** Called once at startup; throws when the backend is unreachable. */
  ping(): Promise<void>

  listTenants(): Promise<Tenant[]>
  createTenant(input: TenantInput): Promise<Tenant>
  updateTenant(id: string, patch: Partial<TenantInput>): Promise<void>
  setTenantActive(id: string, isActive: boolean): Promise<void>
  deleteTenant(id: string): Promise<void>

  listMeters(): Promise<Meter[]>
  createMeter(input: MeterInput, assignments: AssignmentInput[]): Promise<Meter>
  updateMeter(id: string, patch: Partial<MeterInput>): Promise<void>
  setMeterAssignments(meterId: string, assignments: AssignmentInput[]): Promise<void>
  deleteMeter(id: string): Promise<void>

  listBills(): Promise<Bill[]>
  createBill(input: BillInput): Promise<Bill>
  updateBill(id: string, patch: Partial<BillInput>): Promise<void>
  setBillStatus(id: string, status: BillStatus): Promise<void>
  /** Create electricity charges from a bill (idempotent). */
  applyBill(billId: string): Promise<number>
  deleteBill(id: string): Promise<void>

  listCharges(): Promise<Charge[]>
  listPayments(): Promise<Payment[]>
  listAllocations(): Promise<Allocation[]>

  /** Idempotently create rent charges for every active tenant in a month. */
  ensureRentCharges(period: string): Promise<void>
  recordPayment(input: PaymentInput): Promise<Payment>
  deletePayment(id: string): Promise<void>

  createCharge(input: ChargeInput): Promise<Charge>
  updateCharge(id: string, patch: Partial<ChargeInput>): Promise<void>
  deleteCharge(id: string): Promise<void>

  listReminderLogs(): Promise<ReminderLog[]>
  logReminder(input: ReminderLogInput): Promise<ReminderLog>
  updateReminderLog(id: string, status: ReminderLog['status']): Promise<void>

  listAuditLogs(): Promise<AuditLog[]>
}
