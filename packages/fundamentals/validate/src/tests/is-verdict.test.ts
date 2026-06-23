// Schema.is() boolean check + the compile-time verdict fast-path hook.
import { describe, expect, it } from 'vitest'
import { s } from '../v1'

describe('Schema.is() — fallback (no attached verdict)', () => {
  it('agrees with parse().ok for primitives', () => {
    const str = s.string().min(3)
    for (const v of ['abc', 'ab', 42, '', 'hello']) {
      expect(str.is(v)).toBe(str.parse(v).ok)
    }
  })

  it('agrees with parse().ok for an object', () => {
    const schema = s.object({ email: s.string().email(), age: s.number().int() })
    const cases = [{ email: 'a@b.co', age: 30 }, { email: 'nope', age: 1.5 }, null, {}, { email: 'a@b.co', age: 5 }]
    for (const v of cases) expect(schema.is(v)).toBe(schema.parse(v).ok)
  })

  it('returns false for an async schema (sync-only contract)', () => {
    const asyncSchema = s.string().refine(async () => true, { message: 'x' })
    expect(asyncSchema.is('anything')).toBe(false)
  })
})

describe('Schema.is() — attached compile-time verdict (fast path)', () => {
  it('consults the attached verdict instead of parse', () => {
    // A schema that REJECTS everything non-empty, but the attached verdict says
    // "always valid" — `.is()` must return the verdict's answer, proving the
    // runtime op-array is bypassed.
    const schema = s.string().min(100)
    expect(schema.is('short')).toBe(false) // fallback path: too short
    schema._attachCompiledVerdict(() => true)
    expect(schema.is('short')).toBe(true) // fast path wins
    expect(schema.parse('short').ok).toBe(false) // parse() is unaffected
  })

  it('attached verdict can also reject what parse accepts', () => {
    const schema = s.string()
    expect(schema.is('ok')).toBe(true)
    schema._attachCompiledVerdict(() => false)
    expect(schema.is('ok')).toBe(false)
  })

  it('a post-attach chained method invalidates the verdict (falls back)', () => {
    const schema = s.string()
    schema._attachCompiledVerdict(() => false) // pretend "always invalid"
    expect(schema.is('ok')).toBe(false)
    schema.min(2) // mutates _ops → _invalidateCompile → drops the stale verdict
    expect(schema.is('ok')).toBe(true) // back to the real verdict (parse().ok)
    expect(schema.is('x')).toBe(false) // and the new min(2) is in effect
  })

  it('_attachCompiledVerdict returns this for chaining', () => {
    const schema = s.number()
    expect(schema._attachCompiledVerdict(() => true)).toBe(schema)
  })
})
