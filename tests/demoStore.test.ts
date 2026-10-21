import { describe, expect, it } from 'vitest'
import { DemoStore } from '../src/data/demo/demoStore'
import { computeStatement } from '../src/lib/ledger'

async function seeded() {
  const store = new DemoStore()
  const [tenants, charges, payments, allocations] = await Promise.all([
    store.listTenants(),
    store.listCharges(),
    store.listPayments(),
    store.listAllocations(),
  ])
  return { store, tenants, charges, payments, allocations }
}

describe('DemoStore', () => {
  it('prevents duplicate bills for the same meter and month', async () => {
    const { store } = await seeded()
    const meters = await store.listMeters()
    const meter = meters.find((m) => m.assignments.length > 0)!
    const existing = (await store.listBills()).find((b) => b.meterId === meter.id)!

    const input = {
      meterId: meter.id,
      amountPaise: 10000,
      billGeneratedAt: null,
      dueDate: null,
      billReference: null,
      receiptUrl: null,
      status: 'pending_verification' as const,
      source: 'manual_entry' as const,
      notes: null,
    }

    await expect(store.createBill({ ...input, billingMonth: existing.billingMonth })).rejects.toThrow(
      /already exists/i,
    )

    // a different month for the same meter is allowed
    await expect(store.createBill({ ...input, billingMonth: '2030-01' })).resolves.toBeDefined()
  })

  it('creates rent charges idempotently', async () => {
    const { store, tenants } = await seeded()
    const active = tenants.filter((t) => t.isActive)
    const before = (await store.listCharges()).filter((c) => c.chargeType === 'rent').length

    await store.ensureRentCharges('2027-01')
    const afterFirst = (await store.listCharges()).filter(
      (c) => c.chargeType === 'rent' && c.period === '2027-01',
    )
    expect(afterFirst).toHaveLength(active.length)

    await store.ensureRentCharges('2027-01')
    const afterSecond = (await store.listCharges()).filter(
      (c) => c.chargeType === 'rent' && c.period === '2027-01',
    )
    expect(afterSecond).toHaveLength(active.length)
    expect((await store.listCharges()).filter((c) => c.chargeType === 'rent').length).toBe(
      before + active.length,
    )
  })

  it('records a payment and allocates it FIFO', async () => {
    const { store, tenants } = await seeded()
    const tenant = tenants.find((t) => t.isActive)!

    const payment = await store.recordPayment({
      tenantId: tenant.id,
      paymentDate: '2026-12-01',
      amountPaise: 100000,
      method: 'cash',
      reference: null,
      notes: 'test',
    })
    const allocations = (await store.listAllocations()).filter((a) => a.paymentId === payment.id)
    expect(allocations.length).toBeGreaterThan(0)
    expect(allocations.reduce((a, x) => a + x.amountPaise, 0)).toBe(100000)

    const charges = await store.listCharges()
    const allPayments = await store.listPayments()
    const allAllocations = await store.listAllocations()
    const statement = computeStatement(tenant.id, '2026-12', charges, allPayments, allAllocations)
    expect(statement.paymentsReceivedPaise).toBe(100000)
  })

  it('blocks deleting a tenant that has billing history', async () => {
    const { store, tenants } = await seeded()
    const tenant = tenants.find((t) => t.isActive)!
    await expect(store.deleteTenant(tenant.id)).rejects.toThrow(/billing history/i)
    await expect(store.setTenantActive(tenant.id, false)).resolves.toBeUndefined()
  })

  it('blocks deleting a bill whose charges already have allocations', async () => {
    const { store } = await seeded()
    const charges = await store.listCharges()
    const allocations = await store.listAllocations()
    const paidChargeIds = new Set(allocations.map((a) => a.chargeId))
    const bill = (await store.listBills()).find((b) =>
      charges.some((c) => c.sourceId === b.id && paidChargeIds.has(c.id)),
    )
    expect(bill).toBeDefined()
    await expect(store.deleteBill(bill!.id)).rejects.toThrow(/allocated/i)
  })

  it('rejects invalid meter codes / duplicate USC numbers', async () => {
    const { store } = await seeded()
    const meters = await store.listMeters()
    await expect(
      store.createMeter(
        {
          meterCode: meters[0]!.meterCode,
          uscNumber: 'NEW-USC',
          roomLabel: 'X',
          arrangement: 'individual',
          isActive: true,
          notes: null,
        },
        [],
      ),
    ).rejects.toThrow(/already exists/i)
    await expect(
      store.createMeter(
        {
          meterCode: 'M99',
          uscNumber: meters[0]!.uscNumber,
          roomLabel: 'X',
          arrangement: 'individual',
          isActive: true,
          notes: null,
        },
        [],
      ),
    ).rejects.toThrow(/already registered/i)
  })

  it('refuses non-positive payment amounts', async () => {
    const { store, tenants } = await seeded()
    await expect(
      store.recordPayment({
        tenantId: tenants[0]!.id,
        paymentDate: '2026-12-01',
        amountPaise: 0,
        method: 'cash',
        reference: null,
        notes: null,
      }),
    ).rejects.toThrow(/positive/i)
  })
})
