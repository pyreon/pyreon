// Lightweight (client) format checks everyone needs: phone / ip / creditCard.
import { describe, expect, it } from 'vitest'
import { s } from '../v1'

describe('phone (lightweight E.164 shape)', () => {
  const p = s.string().phone()
  it.each(['+14155552671', '14155552671', '(415) 555-2671', '+44 20 7946 0958', '+91-98765-43210'])(
    'accepts %s',
    (v) => expect(p.parse(v).ok).toBe(true),
  )
  it.each(['123', 'abc', '', '+0123456', '++1415', '555-CALL'])('rejects %s', (v) =>
    expect(p.parse(v).ok).toBe(false),
  )
  it('emits an invalid_format issue', () => {
    const r = p.parse('nope')
    expect(r.ok).toBe(false)
    if (!r.ok) expect((r.issues[0] as { code?: string }).code).toBe('invalid_format')
  })
})

describe('ip (v4 + v6)', () => {
  const ip = s.string().ip()
  it.each(['192.168.1.1', '0.0.0.0', '255.255.255.255', '::1', '2001:db8:85a3:0:0:8a2e:370:7334'])(
    'accepts %s',
    (v) => expect(ip.parse(v).ok).toBe(true),
  )
  it.each(['999.1.1.1', '192.168.1', '1.2.3.4.5', 'gggg::1', 'not-an-ip', ''])('rejects %s', (v) =>
    expect(ip.parse(v).ok).toBe(false),
  )
})

describe('creditCard (Luhn + length)', () => {
  const cc = s.string().creditCard()
  it.each(['4242424242424242', '4111 1111 1111 1111', '5555555555554444', '378282246310005'])(
    'accepts valid Luhn %s',
    (v) => expect(cc.parse(v).ok).toBe(true),
  )
  it.each(['4242424242424241', '1234567890123456', '4242', 'abcd', ''])('rejects %s', (v) =>
    expect(cc.parse(v).ok).toBe(false),
  )
})

describe('formats compose with other checks + modifiers', () => {
  it('phone is optional-friendly', () => {
    const schema = s.object({ phone: s.string().phone().optional() })
    expect(schema.parse({}).ok).toBe(true)
    expect(schema.parse({ phone: '+14155552671' }).ok).toBe(true)
    expect(schema.parse({ phone: 'bad' }).ok).toBe(false)
  })
})
