/**
 * Provider adapter contract for electricity-bill retrieval.
 *
 * The app never scrapes a provider site, never bypasses CAPTCHA and never
 * claims an automatic fetch that does not exist. A provider adapter may:
 *   - point the administrator at the official lookup page, and/or
 *   - fetch a bill through a real, authorised API once one is available.
 *
 * Adapters must NOT invent endpoint URLs or response fields.
 */

export interface BillLookupTarget {
  /** Human-readable provider name. */
  provider: string
  /** Official lookup URL to open in a new tab. */
  url: string
  /**
   * How to identify the connection on the target page.
   * `prefillUrl` is intentionally optional — only set it when the provider
   * documents a supported way to pass the USC through the URL.
   */
  identifier: { label: string; value: string; prefillUrl?: string }
  instructions: string[]
}

export interface FetchedBill {
  amountPaise: number
  billReference?: string
  dueDate?: string
  billGeneratedAt?: string
}

export interface BillProviderAdapter {
  id: string
  name: string
  /** True only when a real, tested, authorised API integration exists. */
  supportsAutomaticFetch: boolean
  lookupTarget(uscNumber: string): BillLookupTarget
  fetchBill?(uscNumber: string, billingMonth: string): Promise<FetchedBill>
}
