/**
 * Indian mobile number normalisation for WhatsApp click-to-chat links.
 *
 * wa.me requires digits only, in international format without "+" or spaces.
 * For India that means "91" followed by the 10-digit number.
 */

export const INDIA_COUNTRY_CODE = '91'

export type PhoneResult =
  | { ok: true; e164Digits: string; display: string }
  | { ok: false; reason: string }

/**
 * Normalise an Indian phone number to international digits only.
 * Accepts: "9876543210", "09876543210", "+91 98765 43210", "91-98765-43210".
 */
export function normalizeIndianPhone(input: string): PhoneResult {
  const raw = (input ?? '').trim()
  if (raw === '') return { ok: false, reason: 'Phone number is empty' }

  const digits = raw.replace(/\D/g, '')
  if (digits.length === 0) return { ok: false, reason: 'Phone number must contain digits' }
  if (digits.length > 15) return { ok: false, reason: 'Phone number is too long' }

  let national = digits
  if (digits.length === 10) {
    national = digits
  } else if (digits.length === 11 && digits.startsWith('0')) {
    national = digits.slice(1)
  } else if (digits.length === 12 && digits.startsWith(INDIA_COUNTRY_CODE)) {
    national = digits.slice(2)
  } else if (digits.length === 13 && digits.startsWith(`0${INDIA_COUNTRY_CODE}`)) {
    national = digits.slice(3)
  } else if (digits.length === 13 && digits.startsWith(INDIA_COUNTRY_CODE) && digits[2] === '0') {
    // 91 + 0 + national
    national = digits.slice(3)
  } else {
    return {
      ok: false,
      reason: 'Enter a 10-digit Indian mobile number (optionally with +91)',
    }
  }

  if (national.length !== 10) {
    return { ok: false, reason: 'Enter a 10-digit Indian mobile number' }
  }
  if (!/^[6-9]/.test(national)) {
    return { ok: false, reason: 'Indian mobile numbers start with 6, 7, 8 or 9' }
  }

  const e164Digits = `${INDIA_COUNTRY_CODE}${national}`
  return { ok: true, e164Digits, display: `+91 ${national.slice(0, 5)} ${national.slice(5)}` }
}

/** True when the value can be turned into a valid wa.me target. */
export function isValidIndianPhone(input: string): boolean {
  return normalizeIndianPhone(input).ok
}
