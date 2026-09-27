/**
 * Chainable checks are COPY-ON-WRITE: `.min()` / `.refine()` / `.email()` / …
 * return a NEW schema and never mutate the receiver. The previous
 * push-onto-`this._ops`-and-return-`this` shape made a shared base schema a
 * shared MUTABLE object: deriving `Admin` from a field reused by `User` silently
 * tightened `User` too — and once `User` had been parsed (JIT cached), the
 * result depended on which schema was parsed first.
 */
import { describe, expect, it } from 'vitest'
import { s } from '../index'
import { email, minLength, pipe, string } from '../mini'

describe('copy-on-write chaining', () => {
  it('deriving a tighter field does not tighten the schema it was derived from', () => {
    const name = s.string().min(1)
    const User = s.object({ name })
    const Admin = s.object({ name: name.max(3) })

    expect(User.parse({ name: 'abcdef' }).ok).toBe(true)
    expect(Admin.parse({ name: 'abcdef' }).ok).toBe(false)
    expect(name.parse('abcdef').ok).toBe(true)
  })

  it('is independent of parse order (JIT cache cannot leak a sibling check)', () => {
    const name = s.string().min(1)
    const User = s.object({ name })
    // Compile + cache User BEFORE deriving the sibling.
    expect(User.parse({ name: 'abcdef' }).ok).toBe(true)
    const Admin = s.object({ name: name.max(3) })
    expect(Admin.parse({ name: 'abcdef' }).ok).toBe(false)
    expect(User.parse({ name: 'abcdef' }).ok).toBe(true)
    expect(User.is({ name: 'abcdef' })).toBe(true)
  })

  it('every chain method returns a new instance and leaves the receiver untouched', () => {
    const base = s.string()
    const derived = [
      base.min(2),
      base.max(2),
      base.length(2),
      base.email(),
      base.url(),
      base.uuid(),
      base.regex(/x/),
      base.trim(),
      base.toLowerCase(),
      base.refine((v) => v.length > 0, { message: 'm' }),
      base.catch('x'),
      base.brand<'B'>(),
      base.readonly(),
      base.serverCheck('k'),
      base.describe('d'),
      base.field({ label: 'L' }),
    ]
    for (const d of derived) expect(d).not.toBe(base)
    expect(base._ops).toHaveLength(0)
    expect(base.parse('').ok).toBe(true)
  })

  it('number / bigint / date / array / collection checks are copy-on-write too', () => {
    const n = s.number()
    n.min(5)
    expect(n.parse(1).ok).toBe(true)
    const b = s.bigint()
    b.min(5n)
    expect(b.parse(1n).ok).toBe(true)
    const d = s.date()
    d.min(new Date(2030, 0, 1))
    expect(d.parse(new Date(2000, 0, 1)).ok).toBe(true)
    const a = s.array(s.string())
    a.min(3)
    expect(a.parse([]).ok).toBe(true)
    const set = s.set(s.string())
    set.min(3)
    expect(set.parse(new Set()).ok).toBe(true)
  })

  it('the derived schema keeps the receiver checks and adds its own', () => {
    const base = s.string().min(2)
    const derived = base.max(4)
    expect(derived.parse('a').ok).toBe(false)
    expect(derived.parse('abcde').ok).toBe(false)
    expect(derived.parse('abc').ok).toBe(true)
  })

  it('field metadata on a derived schema does not leak back to the base', () => {
    const base = s.string()
    const labelled = base.field({ label: 'Name' })
    expect(labelled).not.toBe(base)
    expect((labelled as unknown as Record<symbol, unknown>)[Symbol.for('pyreon.validate.fieldMeta')]).toEqual({
      label: 'Name',
    })
    expect((base as unknown as Record<symbol, unknown>)[Symbol.for('pyreon.validate.fieldMeta')]).toBeUndefined()
  })

  it('mini actions and pipe return a new schema', () => {
    const base = string()
    const a = pipe(base, minLength(2), email())
    expect(a).not.toBe(base)
    expect(base.parse('x').ok).toBe(true)
    expect(a.parse('x').ok).toBe(false)
    const b = base.check(minLength(3))
    expect(b).not.toBe(base)
    expect(base.parse('x').ok).toBe(true)
    expect(b.parse('x').ok).toBe(false)
  })

  it('a derived schema compiles on its own (receiver JIT artifacts are not shared)', () => {
    const base = s.string().min(1)
    expect(base.parse('abc').ok).toBe(true) // compile + install own parse
    const derived = base.max(2)
    expect(derived.parse('abc').ok).toBe(false)
    expect(derived.is('abc')).toBe(false)
    expect(derived['~standard'].validate('abc')).toHaveProperty('issues')
    expect(base.parse('abc').ok).toBe(true)
  })
})
