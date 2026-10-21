import { describe, expect, it } from 'vitest'
import {
  buildReminderMessage,
  buildShareLink,
  buildWaMeLink,
  WHATSAPP_SHARE_URL,
} from '../src/lib/whatsapp'

const base = {
  tenantName: 'Asha',
  period: '2026-09',
  rentPaise: 850000,
  electricityPaise: 48000,
  previousDuesPaise: 0,
  otherPaise: 0,
  creditPaise: 0,
  paymentsReceivedPaise: 0,
  outstandingPaise: 898000,
}

describe('buildReminderMessage', () => {
  it('renders statement values from data, not hardcoded text', () => {
    const message = buildReminderMessage(base)
    expect(message).toContain('Hello Asha,')
    expect(message).toContain('September 2026')
    expect(message).toContain('₹8,500.00')
    expect(message).toContain('₹480.00')
    expect(message).toContain('Total outstanding: ₹8,980.00')
    expect(message).not.toContain('[Rent]')
  })

  it('reports fully paid statements accurately', () => {
    const message = buildReminderMessage({ ...base, paymentsReceivedPaise: 898000, outstandingPaise: 0 })
    expect(message).toContain('Payments received: ₹8,980.00')
    expect(message).toContain('Your account is fully paid. Thank you!')
    expect(message).not.toContain('Total outstanding')
  })

  it('includes other charges and credits only when present', () => {
    const withOther = buildReminderMessage({ ...base, otherPaise: 25000 })
    expect(withOther).toContain('Other charges: ₹250.00')
    const plain = buildReminderMessage(base)
    expect(plain).not.toContain('Other charges')
    const withCredit = buildReminderMessage({ ...base, creditPaise: -10000 })
    expect(withCredit).toContain('Credits applied:')
  })
})

describe('buildShareLink', () => {
  it('uses the documented share URL and encodes the message', () => {
    const link = buildShareLink('Hello\nWorld?&=test')
    expect(link.startsWith(`${WHATSAPP_SHARE_URL}?text=`)).toBe(true)
    expect(link).toContain(encodeURIComponent('Hello\nWorld?&=test'))
    expect(link).not.toContain(' ')
  })
})

describe('buildWaMeLink', () => {
  it('builds a click-to-chat link for a valid number', () => {
    const link = buildWaMeLink('9876543210', 'Hi there')
    expect(link).toBe('https://wa.me/919876543210?text=Hi%20there')
  })

  it('accepts formatted numbers and normalises them', () => {
    expect(buildWaMeLink('+91 98765 43210', 'x')).toBe('https://wa.me/919876543210?text=x')
  })

  it('returns null for invalid numbers instead of generating a broken link', () => {
    expect(buildWaMeLink('', 'x')).toBeNull()
    expect(buildWaMeLink('12345', 'x')).toBeNull()
    expect(buildWaMeLink('5876543210', 'x')).toBeNull()
  })

  it('encodes special characters and newlines safely', () => {
    const link = buildWaMeLink('9876543210', 'Line1\nLine2 ₹500 & 50%')
    expect(link).toContain(encodeURIComponent('Line1\nLine2 ₹500 & 50%'))
    expect(link).not.toContain('\n')
    expect(link).not.toContain(' ')
  })
})
