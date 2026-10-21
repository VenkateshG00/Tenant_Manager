import type { BillProviderAdapter } from './types'
import { TGNPDCL_LOOKUP_URL } from '../whatsapp'

/**
 * TGNPDCL / TSNPDCL (Telangana) adapter.
 *
 * Automatic fetching is NOT implemented: TGNPDCL does not publish a free
 * authorised bill-enquiry API for LT consumers, and no eligible BBPS
 * integration has been wired up or tested here. The adapter therefore opens
 * the official "Know Your Bill (LT)" page and the administrator enters the
 * amount manually after checking it against the USC.
 *
 * The USC is intentionally NOT appended to the URL — the official page does
 * not document a supported way to pre-fill it, and inventing query
 * parameters would silently break.
 */
export const tgnpdclAdapter: BillProviderAdapter = {
  id: 'tgnpdcl',
  name: 'TGNPDCL / TSNPDCL',
  supportsAutomaticFetch: false,
  lookupTarget(uscNumber) {
    return {
      provider: 'TGNPDCL / TSNPDCL',
      url: TGNPDCL_LOOKUP_URL,
      identifier: { label: 'USC / Service Number', value: uscNumber },
      instructions: [
        'The official page opens in a new tab.',
        'Enter the USC shown here into the "Know Your Bill" form.',
        'Confirm the consumer name and the billing month match this meter.',
        'Copy the bill amount and due date, then verify and save the bill here.',
      ],
    }
  },
}

export const billProviders: Record<string, BillProviderAdapter> = {
  tgnpdcl: tgnpdclAdapter,
}

export const defaultBillProvider = tgnpdclAdapter
