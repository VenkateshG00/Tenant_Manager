import { describe, expect, it } from 'vitest'
import { validateHttpsUrl } from '../src/lib/validation'

describe('validateHttpsUrl', () => {
  it('accepts secure URLs and an empty optional value', () => {
    expect(validateHttpsUrl('https://example.com/receipt', 'Receipt URL')).toBeNull()
    expect(validateHttpsUrl('', 'Receipt URL')).toBeNull()
  })

  it('rejects insecure, malformed, and credential-bearing URLs', () => {
    expect(validateHttpsUrl('http://example.com/receipt', 'Receipt URL')).toMatch(/HTTPS/)
    expect(validateHttpsUrl('javascript:alert(1)', 'Receipt URL')).toMatch(/HTTPS/)
    expect(validateHttpsUrl('https://user:pass@example.com', 'Receipt URL')).toMatch(/HTTPS/)
    expect(validateHttpsUrl('not a URL', 'Receipt URL')).toMatch(/HTTPS/)
  })
})
