/**
 * The verdict JIT must SERVE all three unknown-key policies, and must keep
 * agreeing with the interpreter on each.
 *
 * Coverage is asserted explicitly because the failure mode is silent: if the
 * emitter stops serving a policy, `.is()` falls back to the parse validator,
 * every behavioural assertion still passes, and the only symptom is being 23x
 * slower. A test that only checked `is() === parse().ok` would stay green
 * through a total regression of this feature.
 *
 * `strip` and `passthrough` compile to the SAME check — in verdict mode they
 * ask the same question, since neither builds output. `strict` additionally
 * emits an own-key scan; `catchall` is refused outright, because the inline
 * loop skips unknown keys and a catchall must VALIDATE them.
 */
import { describe, expect, it } from 'vitest'
import { s } from '../index'
import { tryCompileJitCheck } from '../core/jit'
import type { Schema } from '../core/schema'

const served = (sc: Schema<unknown>): boolean => tryCompileJitCheck(sc) !== null

const shape = () => ({ a: s.number(), b: s.string() })

describe('verdict JIT — unknown-key policy coverage', () => {
  it('serves strip (the default)', () => {
    expect(served(s.object(shape()))).toBe(true)
    expect(served(s.object(shape()).strip())).toBe(true)
  })

  it('serves passthrough', () => {
    expect(served(s.object(shape()).passthrough())).toBe(true)
  })

  it('serves strict', () => {
    expect(served(s.object(shape()).strict())).toBe(true)
  })

  it('REFUSES catchall — the inline loop skips unknown keys, catchall must validate them', () => {
    expect(served(s.object(shape()).catchall(s.string()))).toBe(false)
  })

  it('serves a nested object under each policy', () => {
    for (const mk of [
      (o: ReturnType<typeof shape>) => s.object({ ...o, d: s.object({ x: s.number() }) }),
      (o: ReturnType<typeof shape>) => s.object({ ...o, d: s.object({ x: s.number() }).passthrough() }),
      (o: ReturnType<typeof shape>) => s.object({ ...o, d: s.object({ x: s.number() }).strict() }),
    ]) {
      expect(served(mk(shape()))).toBe(true)
    }
  })
})

describe('verdict JIT — unknown-key semantics match the interpreter', () => {
  const cases: Array<[string, Schema<unknown>, unknown, boolean]> = [
    ['strip accepts extra', s.object(shape()), { a: 1, b: 'x', zzz: 1 }, true],
    ['passthrough accepts extra', s.object(shape()).passthrough(), { a: 1, b: 'x', zzz: 1 }, true],
    ['strict rejects extra', s.object(shape()).strict(), { a: 1, b: 'x', zzz: 1 }, false],
    ['strict accepts clean', s.object(shape()).strict(), { a: 1, b: 'x' }, true],
    // The prototype-chain hole: `in` would report these as declared fields.
    ['strict rejects toString', s.object(shape()).strict(), { a: 1, b: 'x', toString: 1 }, false],
    ['strict rejects constructor', s.object(shape()).strict(), { a: 1, b: 'x', constructor: 1 }, false],
    ['strict rejects valueOf', s.object(shape()).strict(), { a: 1, b: 'x', valueOf: 1 }, false],
    [
      'nested strict rejects extra',
      s.object({ d: s.object({ x: s.number() }).strict() }),
      { d: { x: 1, zzz: 1 } },
      false,
    ],
    [
      'nested strict rejects proto-named',
      s.object({ d: s.object({ x: s.number() }).strict() }),
      { d: { x: 1, hasOwnProperty: 1 } },
      false,
    ],
  ]

  for (const [name, sc, input, want] of cases) {
    it(name, () => {
      expect(sc.is(input)).toBe(want)
      // and the two paths must never disagree
      expect(sc.is(input)).toBe(sc.parse(input).ok)
    })
  }

  it('a field NAMED like a prototype member still validates under strict', () => {
    const T = s.object({ toString: s.number() }).strict()
    expect(T.is({ toString: 1 })).toBe(true)
    expect(T.is({ toString: 1, other: 2 })).toBe(false)
    expect(T.is({ toString: 'no' })).toBe(false)
  })
})

describe('verdict JIT — strict emits the CHEAPER shape when it can', () => {
  // These assert the emitted SOURCE, because both strict paths are
  // semantically identical: neutering the fast path leaves every behavioural
  // spec green and the only symptom is being slower. Without a shape
  // assertion the optimisation could stop applying and nothing would fail.
  const src = (sc: Schema<unknown>): string => {
    const fn = tryCompileJitCheck(sc)
    expect(fn).not.toBeNull()
    return String(fn)
  }

  it('all-required shape uses a key COUNT, not a per-key scan', () => {
    const body = src(s.object({ a: s.number(), b: s.string() }).strict())
    expect(body).toMatch(/Object\.keys\([^)]*\)\.length !== 2/)
    expect(body).not.toContain('.has(')
  })

  it('a field that can be validly ABSENT falls back to the SCAN', () => {
    // `.optional()` / `.nullable()` / `.default()` route to the `_runInto`
    // fallback, which the verdict JIT refuses OUTRIGHT — so they never reach
    // this code. `s.undefined()` is an inline primitive that can still be
    // validly absent, which is exactly the shape that needs the scan.
    const body = src(s.object({ a: s.number(), b: s.undefined() }).strict())
    expect(body).toContain('.has(')
    expect(body).not.toMatch(/Object\.keys\([^)]*\)\.length !==/)
  })

  it('the scan rejects what the count would have accepted, and accepts what it would have rejected', () => {
    const O = s.object({ a: s.number(), b: s.undefined() }).strict()
    // count == 2 == N, but `zzz` is unknown -> the count would ACCEPT this.
    expect(O.is({ a: 1, zzz: 1 })).toBe(false)
    expect(O.is({ a: 1, zzz: 1 })).toBe(O.parse({ a: 1, zzz: 1 }).ok)
    // count == 1 != N, but `b` may be absent -> the count would REJECT this.
    expect(O.is({ a: 1 })).toBe(true)
    expect(O.is({ a: 1 })).toBe(O.parse({ a: 1 }).ok)
  })
})
