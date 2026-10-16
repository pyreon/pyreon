import { describe, expect, it } from 'vitest'
import { base32Decode, base32Encode, generateTotpSecret, totp, verifyTotp } from '../index'

// RFC 6238 Appendix B (SHA-1), secret "12345678901234567890", 8 digits.
const SECRET = base32Encode(new TextEncoder().encode('12345678901234567890'))

describe('totp', () => {
  it('matches the RFC 6238 SHA-1 vectors', async () => {
    const v: [number, string][] = [[59, '94287082'], [1111111109, '07081804'], [1111111111, '14050471'], [1234567890, '89005924'], [2000000000, '69279037']]
    for (const [t, want] of v) expect(await totp(SECRET, t * 1000, 30, 8)).toBe(want)
  })
  it('base32 round-trips and rejects junk', () => {
    const b = crypto.getRandomValues(new Uint8Array(20))
    expect(base32Decode(base32Encode(b))).toEqual(b)
    expect(() => base32Decode('1!')).toThrow(/base32/)
    expect(generateTotpSecret()).toMatch(/^[A-Z2-7]{32}$/)
  })
  it('verifies within the window and returns the step', async () => {
    const now = 1_700_000_000_000
    const code = await totp(SECRET, now)
    expect(await verifyTotp(SECRET, code, { now })).toEqual({ ok: true, step: Math.floor(now / 30000) })
    expect(await verifyTotp(SECRET, code, { now: now + 30_000 })).toMatchObject({ ok: true })
    expect(await verifyTotp(SECRET, code, { now: now + 120_000 })).toEqual({ ok: false })
  })
  it('rejects replay, malformed and wrong codes', async () => {
    const now = 1_700_000_000_000
    const code = await totp(SECRET, now)
    const first = await verifyTotp(SECRET, code, { now })
    expect(first.ok && (await verifyTotp(SECRET, code, { now, lastUsedStep: first.step }))).toEqual({ ok: false })
    for (const bad of ['', '12345', '1234567', 'abcdef', '000000x']) expect(await verifyTotp(SECRET, bad, { now })).toEqual({ ok: false })
    const wrong = code === '000000' ? '000001' : '000000'
    expect(await verifyTotp(SECRET, wrong, { now })).toEqual({ ok: false })
  })
})
