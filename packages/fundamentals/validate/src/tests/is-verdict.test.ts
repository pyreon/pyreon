// Schema.is() boolean check + the compile-time verdict fast-path hook.
import { afterEach, describe, expect, it } from 'vitest'
import { configure, s } from '../index'

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

describe('Schema.is() — attached compile-time verdict (eval-free path)', () => {
  // The build-attached verdict (`compileValidators`) is the eval-free compiled
  // path: `.is()` consults it only when the runtime verdict JIT did not serve
  // the schema (JIT off — a CSP without 'unsafe-eval' — or a refused shape).
  // With the JIT on, the runtime verdict wins, because it is the faster one.
  afterEach(() => configure({ jit: true }))

  it('with the JIT on, the runtime verdict wins over an attached one', () => {
    const schema = s.string().min(100)
    schema._attachCompiledVerdict(() => true)
    expect(schema.is('short')).toBe(false) // the runtime verdict decides
    expect(schema.is('x'.repeat(100))).toBe(true)
  })

  it('with the JIT off, .is() consults the attached verdict instead of parse', () => {
    configure({ jit: false })
    // A schema that REJECTS everything non-empty, but the attached verdict says
    // "always valid" — `.is()` must return the verdict's answer, proving the
    // interpreter is bypassed.
    const schema = s.string().min(100)
    expect(schema.is('short')).toBe(false) // interpreter: too short
    schema._attachCompiledVerdict(() => true)
    expect(schema.is('short')).toBe(true) // attached verdict wins
    expect(schema.parse('short').ok).toBe(false) // parse() is unaffected
  })

  it('with the JIT off, an attached verdict can also reject what parse accepts', () => {
    configure({ jit: false })
    const schema = s.string()
    expect(schema.is('ok')).toBe(true)
    schema._attachCompiledVerdict(() => false)
    expect(schema.is('ok')).toBe(false)
  })

  it('a refused shape (async refine) consults the attached verdict with the JIT on', () => {
    const schema = s.string().refine(async () => true, { message: 'x' })
    schema._attachCompiledVerdict(() => true)
    expect(schema.is('ok')).toBe(true)
  })

  it('a post-attach chained method invalidates the verdict (falls back)', () => {
    configure({ jit: false })
    const schema = s.string()
    schema._attachCompiledVerdict(() => false) // pretend "always invalid"
    expect(schema.is('ok')).toBe(false)
    // Chaining is copy-on-write: the derived schema never inherits a verdict
    // attached to its receiver (the attach reflects the receiver's op list).
    const derived = schema.min(2)
    expect(derived.is('ok')).toBe(true) // the real verdict (parse().ok)
    expect(derived.is('x')).toBe(false) // and the new min(2) is in effect
    // A direct op-list change + invalidation drops the stale verdict too.
    schema._invalidateCompile()
    expect(schema.is('ok')).toBe(true)
  })

  it('_attachCompiledVerdict returns this for chaining', () => {
    const schema = s.number()
    expect(schema._attachCompiledVerdict(() => true)).toBe(schema)
  })
})
