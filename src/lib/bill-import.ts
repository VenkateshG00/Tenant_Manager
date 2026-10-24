export interface BillImportDraft {
  version: 1
  uscNumber: string
  amount: string
  billingMonth: string | null
  billGeneratedAt: string | null
  dueDate: string | null
  billReference: string | null
}

const IMPORT_KEY = 'tenant-manager-bill'

function isIsoDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

export function parseBillImportHash(hash: string): BillImportDraft | null {
  if (hash.length > 4096) return null
  const params = new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash)
  const encoded = params.get(IMPORT_KEY)
  if (!encoded || encoded.length > 2048) return null

  try {
    const value: unknown = JSON.parse(encoded)
    if (!value || typeof value !== 'object') return null
    const draft = value as Partial<BillImportDraft>
    if (
      draft.version !== 1 ||
      typeof draft.uscNumber !== 'string' ||
      !/^\d{8}$/.test(draft.uscNumber) ||
      typeof draft.amount !== 'string' ||
      !/^\d{1,7}(?:\.\d{1,2})?$/.test(draft.amount)
    ) {
      return null
    }

    const billingMonth =
      draft.billingMonth === null ||
      (typeof draft.billingMonth === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(draft.billingMonth))
        ? draft.billingMonth
        : undefined
    const billGeneratedAt =
      draft.billGeneratedAt === null || isIsoDate(draft.billGeneratedAt)
        ? draft.billGeneratedAt
        : undefined
    const dueDate = draft.dueDate === null || isIsoDate(draft.dueDate) ? draft.dueDate : undefined
    const billReference =
      draft.billReference === null ||
      (typeof draft.billReference === 'string' && draft.billReference.length <= 80)
        ? draft.billReference
        : undefined

    if (
      billingMonth === undefined ||
      billGeneratedAt === undefined ||
      dueDate === undefined ||
      billReference === undefined
    ) {
      return null
    }

    return {
      version: 1,
      uscNumber: draft.uscNumber,
      amount: draft.amount,
      billingMonth,
      billGeneratedAt,
      dueDate,
      billReference,
    }
  } catch {
    return null
  }
}
