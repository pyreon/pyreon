// s.nativeEnum() — validate a value of a TS native enum (Zod-4 parity).
import { describe, expect, it } from 'vitest'
import { getValidEnumValues } from '../primitives/literal'
import { s } from '../v1'

enum Role {
  Admin = 'admin',
  User = 'user',
}

enum Numeric {
  A,
  B,
  C,
}

const ConstObj = { Left: 'left', Right: 'right' } as const

describe('s.nativeEnum — string enum', () => {
  const schema = s.nativeEnum(Role)
  it('accepts member values', () => {
    expect(schema.parse('admin').ok).toBe(true)
    const r = schema.parse(Role.User)
    expect(r.ok && r.value).toBe('user')
  })
  it('rejects non-members (incl. the KEY names)', () => {
    expect(schema.parse('Admin').ok).toBe(false) // key, not value
    expect(schema.parse('nope').ok).toBe(false)
    expect(schema.parse(0).ok).toBe(false)
  })
})

describe('s.nativeEnum — numeric enum (reverse-mapping filtered)', () => {
  const schema = s.nativeEnum(Numeric)
  it('accepts the numeric member values', () => {
    expect(schema.parse(0).ok).toBe(true)
    expect(schema.parse(2).ok).toBe(true)
    expect(schema.parse(Numeric.B).ok).toBe(true)
  })
  it('REJECTS the reverse-mapping key strings', () => {
    // TS compiles `enum { A }` to `{ A: 0, 0: 'A' }`; `'A'` must NOT validate.
    expect(schema.parse('A').ok).toBe(false)
    expect(schema.parse('B').ok).toBe(false)
  })
  it('rejects out-of-range numbers', () => {
    expect(schema.parse(3).ok).toBe(false)
    expect(schema.parse(-1).ok).toBe(false)
  })
})

describe('s.nativeEnum — const value-object', () => {
  const schema = s.nativeEnum(ConstObj)
  it('accepts the values', () => {
    expect(schema.parse('left').ok).toBe(true)
    expect(schema.parse('right').ok).toBe(true)
  })
  it('rejects the keys + unknowns', () => {
    expect(schema.parse('Left').ok).toBe(false)
    expect(schema.parse('center').ok).toBe(false)
  })
})

describe('getValidEnumValues', () => {
  it('returns values for a string enum', () => {
    expect(getValidEnumValues(Role).sort()).toEqual(['admin', 'user'])
  })
  it('filters numeric reverse-mappings', () => {
    // Object.values(Numeric) would be ['A','B','C',0,1,2]; only [0,1,2] are valid.
    expect(getValidEnumValues(Numeric).sort()).toEqual([0, 1, 2])
  })
})

describe('s.nativeEnum — composition + path', () => {
  it('works as an object field carrying the path', () => {
    const schema = s.object({ role: s.nativeEnum(Role) })
    const r = schema.parse({ role: 'bogus' })
    expect(!r.ok && r.issues[0]?.path).toEqual(['role'])
  })
})
