/** Row shapes shared by the Supabase store and the demo store. */

import type {
  Allocation,
  Charge,
  ChargeType,
  Payment,
  PaymentMethod,
} from '../lib/ledger'

export type { Allocation, Charge, ChargeType, Payment, PaymentMethod }

export interface Tenant {
  id: string
  name: string
  roomNumber: string
  phone: string | null
  monthlyRentPaise: number
  moveInDate: string | null
  isActive: boolean
  notes: string | null
  createdAt: string
}

export interface MeterAssignment {
  id: string
  meterId: string
  tenantId: string
  allocationWeight: number
  notes: string | null
}

export type MeterArrangement = 'individual' | 'shared' | 'multi_per_tenant'

export interface Meter {
  id: string
  meterCode: string
  uscNumber: string
  roomLabel: string
  arrangement: MeterArrangement
  isActive: boolean
  notes: string | null
  assignments: MeterAssignment[]
  createdAt: string
}

export type BillStatus = 'pending_verification' | 'verified' | 'paid' | 'void'
export type BillSource = 'manual_entry' | 'official_lookup'

export interface Bill {
  id: string
  meterId: string
  billingMonth: string
  amountPaise: number
  billGeneratedAt: string | null
  dueDate: string | null
  billReference: string | null
  receiptUrl: string | null
  status: BillStatus
  source: BillSource
  notes: string | null
  createdAt: string
  updatedAt: string
  /** Client-side join, filled by listBills. */
  meter?: Meter
  hasCharges?: boolean
}

export type ReminderStatus = 'prepared' | 'sent' | 'skipped'

export interface ReminderLog {
  id: string
  tenantId: string
  period: string
  status: ReminderStatus
  channel: string
  message: string
  phoneDigits: string | null
  createdAt: string
}

export interface AuditLog {
  id: string
  entityType: string
  entityId: string | null
  action: string
  before: unknown
  after: unknown
  createdAt: string
}

export interface TenantInput {
  name: string
  roomNumber: string
  phone: string | null
  monthlyRentPaise: number
  moveInDate: string | null
  isActive: boolean
  notes: string | null
}

export interface MeterInput {
  meterCode: string
  uscNumber: string
  roomLabel: string
  arrangement: MeterArrangement
  isActive: boolean
  notes: string | null
}

export interface BillInput {
  meterId: string
  billingMonth: string
  amountPaise: number
  billGeneratedAt: string | null
  dueDate: string | null
  billReference: string | null
  receiptUrl: string | null
  status: BillStatus
  source: BillSource
  notes: string | null
}

export interface PaymentInput {
  tenantId: string
  paymentDate: string
  amountPaise: number
  method: PaymentMethod
  reference: string | null
  notes: string | null
}

export interface ChargeInput {
  tenantId: string
  chargeType: ChargeType
  period: string
  chargeDate: string
  amountPaise: number
  description: string | null
  sourceId?: string | null
}

export interface AssignmentInput {
  tenantId: string
  allocationWeight: number
  notes?: string | null
}
