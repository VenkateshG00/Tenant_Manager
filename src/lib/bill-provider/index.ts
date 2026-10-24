import type { BillProviderAdapter } from './types'
import { TGNPDCL_LOOKUP_URL } from '../whatsapp'

/**
 * TGNPDCL / TSNPDCL (Telangana) adapter.
 *
 * No authorised bill-enquiry API or eligible BBPS integration is connected.
 * The optional desktop browser helper works with the official page itself;
 * without that extension, the administrator completes the lookup and entry
 * manually.
 *
 * The provider URL stays unchanged. The optional desktop extension receives
 * the selected USC in a URL fragment, which the provider server never gets.
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
        'With the desktop helper installed, it fills and submits the USC automatically; otherwise enter it manually.',
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

export function lookupUrlWithUsc(uscNumber: string): string {
  const url = defaultBillProvider.lookupTarget(uscNumber).url
  return uscNumber
    ? `${url}#tenant-manager-usc=${encodeURIComponent(uscNumber)}`
    : url
}
