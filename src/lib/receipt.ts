export function formatReceiptNumber(paymentId: string, paymentDate: string): string {
  const date = paymentDate.replace(/\D/g, '')
  const suffix = paymentId.replace(/[^a-z0-9]/gi, '').slice(-8).toUpperCase()

  if (date.length !== 8 || suffix.length === 0) {
    throw new Error('Cannot format a receipt number from invalid payment details')
  }

  return `RCT-${date}-${suffix.padStart(8, '0')}`
}
