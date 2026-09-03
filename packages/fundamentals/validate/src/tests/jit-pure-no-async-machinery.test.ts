import { describe, expect, it } from 'vitest'
import { s } from '../index'

/**
 * A fallback arm is the ONLY subtree that can return a Promise, so a
 * fallback-free (`_jitPure`) tree can never defer — the `A`/`B`/`NOOP` pending
 * machinery is dead code in it. The array codegen used to reference `A`
 * unconditionally for slot bookkeeping, which opted every array- or
 * object-bearing schema into carrying that machinery on every parse: three
 * prelude initialisers, a `NOOP` closure literal, a baseline slot count, and a
 * live `Promise.all` ternary on both the array own-check and every return.
 *
 * These are SOURCE-SHAPE assertions on purpose. The behavioural contract is
 * already covered by the differential suites (`jit-differential`,
 * `jit-async-differential`, `pure-seam-differential`) — those keep passing
 * whether or not the dead machinery is emitted, which is exactly why the
 * elision needs its own lock. Without one, re-broadening the flag is a silent
 * regression with no failing test.
 */
const sourceOf = (schema: unknown): string => {
  const internal = schema as { _compiled?: unknown }
  const compiled = internal._compiled
  if (typeof compiled !== 'function') throw new Error('schema did not compile to a JIT validator')
  return String(compiled)
}

/** `_compiled` is built lazily on first parse. */
const compileVia = (schema: { parse(v: unknown): unknown }, sample: unknown): string => {
  schema.parse(sample)
  return sourceOf(schema)
}

const isPure = (schema: unknown): boolean =>
  (schema as { _compiled?: { _jitPure?: boolean } })._compiled?._jitPure === true

describe('JIT — a pure tree emits no async machinery', () => {
  it('an array of objects carries none of it', () => {
    const schema = s.array(s.object({ id: s.number(), name: s.string() }))
    const src = compileVia(schema, [{ id: 1, name: 'a' }])

    expect(isPure(schema)).toBe(true)
    expect(src).not.toContain('var A = null')
    expect(src).not.toContain('NOOP')
    expect(src).not.toContain('Promise.all')
  })

  it("an array's own checks emit only the arm that can run", () => {
    const schema = s.array(s.number()).min(2)
    const src = compileVia(schema, [1, 2])

    // The deferred arm (`A.push(Promise.all(A.slice(...)))`) is unreachable
    // without a fallback, so only the issue-count guard survives.
    expect(src).not.toContain('Promise.all')
    expect(src).not.toContain('A.length')
    expect(src).toMatch(/if \(ctx\.issues\.length === \w+\) \{/)
  })

  it('the root return is a bare return, not a pending barrier', () => {
    const schema = s.object({ tags: s.array(s.string()) })
    const src = compileVia(schema, { tags: ['x'] })

    expect(src).not.toMatch(/return A === null \?/)
  })

  it('a nested object inside an array is still pure', () => {
    const schema = s.object({ rows: s.array(s.object({ n: s.number() })) })
    const src = compileVia(schema, { rows: [{ n: 1 }] })

    expect(isPure(schema)).toBe(true)
    expect(src).not.toContain('var A = null')
  })
})

describe('JIT — a tree WITH a fallback keeps the machinery', () => {
  it('an async refine inside an array still emits A/B/NOOP and Promise.all', () => {
    const schema = s.array(s.number().refine(async (n: number) => n > 0, { message: 'positive' }))
    const src = compileVia(schema, [1])

    // Not pure — it can run user code and can defer.
    expect(isPure(schema)).toBe(false)
    expect(src).toContain('var A = null')
    expect(src).toContain('NOOP')
    expect(src).toContain('Promise.all')
  })

  it('and it still resolves and rejects correctly through parseAsync', async () => {
    const schema = s.array(s.number().refine(async (n: number) => n > 0, { message: 'positive' }))

    const ok = await schema.parseAsync([1, 2, 3])
    expect(ok.ok).toBe(true)
    expect(ok.ok && ok.value).toEqual([1, 2, 3])

    const bad = await schema.parseAsync([1, -5])
    expect(bad.ok).toBe(false)
  })
})

describe('JIT — eliding the machinery changes no observable behaviour', () => {
  it('array own-checks still gate on element failure, not on element count', () => {
    // The interpreter contract: own checks are SKIPPED when an element failed.
    // The elided arm must preserve that, so a too-short array whose element is
    // ALSO the wrong type reports the element issue and not the min issue.
    const schema = s.array(s.number()).min(3)

    const badElement = schema.parse(['nope'])
    expect(badElement.ok).toBe(false)
    const messages = badElement.ok ? [] : badElement.issues.map((i) => i.message).join(' | ')
    expect(messages).not.toMatch(/at least 3|min/i)
  })

  it('own checks still run when every element is valid', () => {
    const schema = s.array(s.number()).min(3)

    expect(schema.parse([1, 2, 3]).ok).toBe(true)
    expect(schema.parse([1, 2]).ok).toBe(false)
  })

  it('values and issue paths are unchanged for a nested failure', () => {
    const schema = s.object({ rows: s.array(s.object({ n: s.number() })) })

    const good = schema.parse({ rows: [{ n: 1 }, { n: 2 }] })
    expect(good.ok).toBe(true)
    expect(good.ok && good.value).toEqual({ rows: [{ n: 1 }, { n: 2 }] })

    const bad = schema.parse({ rows: [{ n: 1 }, { n: 'x' }] })
    expect(bad.ok).toBe(false)
    expect(bad.ok === false && bad.issues[0]?.path).toEqual(['rows', 1, 'n'])
  })
})
