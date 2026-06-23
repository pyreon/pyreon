// Long-tail string formats (Zod-4 parity): cuid / base64url / cidr / duration / e164.
import { describe, expect, it } from 'vitest'
import { s } from '../v1'

describe('string.cuid()', () => {
  const schema = s.string().cuid()
  it('accepts a valid cuid', () => {
    expect(schema.parse('cjld2cjxh0000qzrmn831i7rn').ok).toBe(true)
  })
  it('rejects non-cuid', () => {
    expect(schema.parse('not-a-cuid').ok).toBe(false) // contains a dash
    expect(schema.parse('x12345678').ok).toBe(false) // does not start with c
    expect(schema.parse('c123').ok).toBe(false) // too short
  })
})

describe('string.base64url()', () => {
  const schema = s.string().base64url()
  it('accepts url-safe base64', () => {
    expect(schema.parse('aGVsbG8gd29ybGQ').ok).toBe(true)
    expect(schema.parse('a-b_c').ok).toBe(true)
    expect(schema.parse('YQ==').ok).toBe(true)
  })
  it('rejects standard-base64 chars + empty', () => {
    expect(schema.parse('a+b/c').ok).toBe(false) // + and / are not url-safe
    expect(schema.parse('').ok).toBe(false)
  })
})

describe('string.cidr()', () => {
  const schema = s.string().cidr()
  it('accepts IPv4 CIDR', () => {
    expect(schema.parse('192.168.0.0/16').ok).toBe(true)
    expect(schema.parse('10.0.0.0/8').ok).toBe(true)
    expect(schema.parse('0.0.0.0/0').ok).toBe(true)
  })
  it('accepts IPv6 CIDR (addresses the shared IP regex supports)', () => {
    expect(schema.parse('2001:db8::/32').ok).toBe(true)
    expect(schema.parse('fe80::1/64').ok).toBe(true)
  })
  it('rejects bad CIDR', () => {
    expect(schema.parse('192.168.0.1').ok).toBe(false) // no prefix
    expect(schema.parse('192.168.0.0/33').ok).toBe(false) // prefix out of range
    expect(schema.parse('999.1.1.1/8').ok).toBe(false) // bad octet
  })
})

describe('string.duration()', () => {
  const schema = s.string().duration()
  it('accepts ISO 8601 durations', () => {
    expect(schema.parse('P3Y6M4DT12H30M5S').ok).toBe(true)
    expect(schema.parse('PT1H').ok).toBe(true)
    expect(schema.parse('P1W').ok).toBe(true)
    expect(schema.parse('PT0.5S').ok).toBe(true)
  })
  it('rejects malformed durations', () => {
    expect(schema.parse('P').ok).toBe(false) // bare P
    expect(schema.parse('PT').ok).toBe(false) // trailing T
    expect(schema.parse('1Y').ok).toBe(false) // no leading P
    expect(schema.parse('hello').ok).toBe(false)
  })
})

describe('string.e164()', () => {
  const schema = s.string().e164()
  it('accepts E.164 numbers', () => {
    expect(schema.parse('+14155552671').ok).toBe(true)
    expect(schema.parse('+447911123456').ok).toBe(true)
  })
  it('rejects bad phone numbers', () => {
    expect(schema.parse('14155552671').ok).toBe(false) // no +
    expect(schema.parse('+0123').ok).toBe(false) // leading zero
    expect(schema.parse('+').ok).toBe(false)
    expect(schema.parse('+1234567890123456').ok).toBe(false) // too long (>15 digits)
  })
})

describe('long-tail formats compose + carry opts', () => {
  it('honors a custom message', () => {
    const r = s.string().cuid({ message: 'bad id' }).parse('nope')
    expect(!r.ok && r.issues[0]?.message).toBe('bad id')
  })
  it('works as an object field carrying the path', () => {
    const r = s.object({ ip: s.string().cidr() }).parse({ ip: 'nope' })
    expect(!r.ok && r.issues[0]?.path).toEqual(['ip'])
  })
})
