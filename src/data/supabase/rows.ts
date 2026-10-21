/** Supabase row shapes (snake_case) used by the Supabase store. */

export interface TenantRow {
  id: string
  name: string
  room_number: string
  phone: string | null
  monthly_rent: string
  move_in_date: string | null
  is_active: boolean
  notes: string | null
  created_at: string
}

export interface MeterRow {
  id: string
  meter_code: string
  usc_number: string
  room_label: string
  arrangement: string
  is_active: boolean
  notes: string | null
  created_at: string
}

export interface AssignmentRow {
  id: string
  meter_id: string
  tenant_id: string
  allocation_weight: number
  notes: string | null
}

export interface BillRow {
  id: string
  meter_id: string
  billing_month: string
  amount: string
  bill_generated_at: string | null
  due_date: string | null
  bill_reference: string | null
  receipt_url: string | null
  status: string
  source: string
  notes: string | null
  created_at: string
  updated_at: string
}

export interface ChargeRow {
  id: string
  tenant_id: string
  charge_type: string
  period: string
  charge_date: string
  amount: string
  description: string | null
  source_id: string | null
  created_at: string
}

export interface PaymentRow {
  id: string
  tenant_id: string
  payment_date: string
  amount: string
  method: string
  reference: string | null
  notes: string | null
  created_at: string
}

export interface AllocationDbRow {
  id: string
  payment_id: string
  charge_id: string
  amount: string
  created_at: string
}

export interface ReminderRow {
  id: string
  tenant_id: string
  period: string
  status: string
  channel: string
  message: string
  phone_digits: string | null
  created_at: string
}

export interface AuditRow {
  id: string
  entity_type: string
  entity_id: string | null
  action: string
  before_data: unknown
  after_data: unknown
  created_at: string
}
