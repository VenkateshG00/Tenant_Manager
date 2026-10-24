/**
 * WhatsApp link generation — click-to-chat only, no Business API.
 *
 * Nothing here sends a message. Links merely open WhatsApp so the
 * administrator can review the text and press Send themselves.
 */

import { formatINR, type Paise } from './money'
import { formatMonth } from './dates'
import { normalizeIndianPhone } from './phone'

export const TGNPDCL_LOOKUP_URL = 'https://tgnpdcl.com/Menu/KnowYourBillLT'

export const WHATSAPP_SHARE_URL = 'https://api.whatsapp.com/send'

export interface ReminderMessageInput {
  tenantName: string
  period: string
  rentPaise: Paise
  electricityPaise: Paise
  previousDuesPaise: Paise
  otherPaise: Paise
  creditPaise: Paise
  paymentsReceivedPaise: Paise
  outstandingPaise: Paise
}

function inr(value: Paise): string {
  // Keep the currency symbol attached to the amount in WhatsApp's text layout.
  return formatINR(value).replace(/\u00a0/g, ' ')
}

/**
 * Build the reminder message from actual statement data.
 * Fully paid statements are reported as paid with zero outstanding.
 */
export function buildReminderMessage(input: ReminderMessageInput): string {
  const outstanding = input.outstandingPaise
  const lines: string[] = [
    `Hello ${input.tenantName},`,
    '',
    `Here is your rent and electricity statement for ${formatMonth(input.period)}.`,
    '',
    `Monthly rent: ${inr(input.rentPaise)}`,
    `Electricity charges: ${inr(input.electricityPaise)}`,
    `Previous outstanding dues: ${inr(input.previousDuesPaise)}`,
  ]

  if (input.otherPaise !== 0) {
    lines.push(`Other charges: ${inr(input.otherPaise)}`)
  }
  if (input.creditPaise !== 0) {
    lines.push(`Credits applied: ${inr(input.creditPaise)}`)
  }

  lines.push(`Payments received: ${inr(input.paymentsReceivedPaise)}`)

  if (outstanding <= 0) {
    lines.push('')
    lines.push('Your account is fully paid. Thank you!')
    return `${lines.join('\n')}\n`
  }

  lines.push(`Total outstanding: ${inr(outstanding)}`)
  lines.push('')
  lines.push('Please make the payment at your convenience. Thank you.')
  return `${lines.join('\n')}\n`
}

/** Documented choose-contact flow: opens WhatsApp with the text prefilled. */
export function buildShareLink(message: string): string {
  return `${WHATSAPP_SHARE_URL}?text=${encodeURIComponent(message)}`
}

/**
 * Documented click-to-chat flow for a saved number.
 * `phoneInput` is normalised to "91XXXXXXXXXX"; returns null when invalid.
 */
export function buildWaMeLink(phoneInput: string, message: string): string | null {
  const normalized = normalizeIndianPhone(phoneInput)
  if (!normalized.ok) return null
  return `https://wa.me/${normalized.e164Digits}?text=${encodeURIComponent(message)}`
}

/** Open a WhatsApp link in a new tab/window. */
export function openWhatsApp(url: string): void {
  window.open(url, '_blank', 'noopener,noreferrer')
}

/** Copy using the browser clipboard API when available. */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    return false
  }
  return false
}
