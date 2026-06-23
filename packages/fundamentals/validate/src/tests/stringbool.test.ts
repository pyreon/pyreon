// s.stringbool() — coerce a boolean-ish string to a real boolean (Zod 4 parity).
import { describe, expect, it } from 'vitest'
import { s, stringbool } from '../v1'

describe('stringbool — default tokens', () => {
  const schema = s.stringbool()
  it.each(['true', '1', 'yes', 'on', 'y', 'enabled'])('%s → true', (v) => {
    const r = schema.parse(v)
    expect(r.ok && r.value).toBe(true)
  })
  it.each(['false', '0', 'no', 'off', 'n', 'disabled'])('%s → false', (v) => {
    const r = schema.parse(v)
    expect(r.ok).toBe(true)
    expect(r.ok && r.value).toBe(false)
  })
  it('is case-insensitive and trims', () => {
    expect(s.stringbool().parse('  TRUE  ').ok && s.stringbool().parse('  TRUE  ').ok).toBe(true)
    const r = s.stringbool().parse('  Off ')
    expect(r.ok && r.value).toBe(false)
  })
})

describe('stringbool — rejects', () => {
  it('rejects a non-string', () => {
    expect(s.stringbool().parse(true).ok).toBe(false)
    expect(s.stringbool().parse(1).ok).toBe(false)
  })
  it('rejects an unrecognized string', () => {
    const r = s.stringbool().parse('maybe')
    expect(r.ok).toBe(false)
    expect(!r.ok && r.issues[0]?.message).toBe('Invalid boolean string')
  })
})

describe('stringbool — custom tokens + message', () => {
  it('honors custom truthy/falsy sets', () => {
    const schema = stringbool({ truthy: ['si'], falsy: ['no'] })
    const si = schema.parse('si')
    expect(si.ok && si.value).toBe(true)
    const no = schema.parse('no')
    expect(no.ok && no.value).toBe(false)
    expect(schema.parse('yes').ok).toBe(false) // not in custom truthy
  })
  it('honors a custom message', () => {
    const r = stringbool({ message: 'not a bool' }).parse('xyz')
    expect(!r.ok && r.issues[0]?.message).toBe('not a bool')
  })
})

describe('stringbool — composition', () => {
  it('works as an object field with the right output type', () => {
    const schema = s.object({ flag: s.stringbool() })
    const r = schema.parse({ flag: 'yes' })
    expect(r.ok).toBe(true)
    if (r.ok) {
      const v: boolean = r.value.flag
      expect(v).toBe(true)
    }
  })
  it('field-level error carries the path', () => {
    const r = s.object({ flag: s.stringbool() }).parse({ flag: 'bogus' })
    expect(!r.ok && r.issues[0]?.path).toEqual(['flag'])
  })
})
