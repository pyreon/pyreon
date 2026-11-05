// Regression lock for the lazy `EMPTY_PATH` ctx-allocation optimization
// (a scalar / flat-object parse allocates ZERO path arrays; a keyed descent
// swaps the shared frozen sentinel for a real per-parse array via
// `mutablePath`). The invariants:
//   1. The shared sentinel is NEVER mutated (frozen — a missed write site
//      would throw here rather than silently corrupt it across parses).
//   2. Error paths are still correct — a deep/format failure reconstructs the
//      real path even though the valid path never touched it.
//   3. Parses are independent: an object parse that materialized a real path
//      cannot leak that path into a following scalar parse.
//
// Bisect: point `makeCtx` back at a per-parse `[]` and (1)/(3) still pass but
// the ~2× ctx-alloc win is gone; freeze-swap correctness is what these lock.
import { describe, expect, it } from 'vitest'
import { EMPTY_PATH } from '../core/ops'
import { s } from '../v1'

describe('EMPTY_PATH sentinel', () => {
  it('is a frozen, empty shared array', () => {
    expect(Object.isFrozen(EMPTY_PATH)).toBe(true)
    expect(EMPTY_PATH.length).toBe(0)
  })

  it('stays empty + frozen after many mixed parses (never mutated)', () => {
    const obj = s.object({ a: s.object({ b: s.string().min(2) }) })
    const arr = s.array(s.object({ email: s.string().email() }))
    const scalar = s.number().int().between(0, 10)
    for (let i = 0; i < 50; i++) {
      scalar.parse(5)
      obj.parse({ a: { b: 'x' } }) // deep failure — materializes a real path
      arr.parse([{ email: 'bad' }]) // element format failure — materializes
      scalar.parse('nope') // scalar type failure
    }
    expect(EMPTY_PATH.length).toBe(0)
    expect(Object.isFrozen(EMPTY_PATH)).toBe(true)
  })

  it('reconstructs the real path at a deep failure site', () => {
    const schema = s.object({ user: s.object({ email: s.string().email() }) })
    const r = schema.parse({ user: { email: 'nope' } })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.issues[0]!.path).toEqual(['user', 'email'])
  })

  it('reconstructs an array-element path at a failure site', () => {
    const schema = s.array(s.object({ email: s.string().email() }))
    const r = schema.parse([{ email: 'ok@x.com' }, { email: 'nope' }])
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.issues[0]!.path).toEqual([1, 'email'])
  })

  it('a top-level scalar failure has an empty path', () => {
    const r = s.string().email().parse('nope')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.issues[0]!.path).toEqual([])
  })

  it('an object parse does not leak its materialized path into a later scalar parse', () => {
    const obj = s.object({ deep: s.object({ v: s.string().min(5) }) })
    // Materialize a real path via a deep failure.
    const bad = obj.parse({ deep: { v: 'x' } })
    expect(bad.ok).toBe(false)
    if (!bad.ok) expect(bad.issues[0]!.path).toEqual(['deep', 'v'])
    // The very next scalar failure must report an EMPTY path — a fresh ctx.
    const scalar = s.string().email().parse('nope')
    expect(scalar.ok).toBe(false)
    if (!scalar.ok) expect(scalar.issues[0]!.path).toEqual([])
  })
  // `snapshotPath` returns a fresh `[]` literal for a root issue instead of
  // `EMPTY_PATH.slice()` (slicing a FROZEN array leaves JSC's fast copy path —
  // ~40% of a scalar type-mismatch parse). The contract the literal must keep:
  // every issue owns a fresh, MUTABLE, UNSHARED path — never the sentinel.
  it('a root issue path is a fresh mutable array, never the shared sentinel', () => {
    const typeFail = s.string().parse(42)
    const checkFail = s.string().email().parse('nope')
    const custom = s.string().refine(() => false, { message: 'no' }).parse('x')
    const paths = [typeFail, checkFail, custom].map((r) => {
      if (r.ok) throw new Error('expected failure')
      return r.issues[0]!.path as unknown[]
    })
    for (const p of paths) {
      expect(p).not.toBe(EMPTY_PATH)
      expect(Object.isFrozen(p)).toBe(false)
      expect(p).toEqual([])
    }
    expect(paths[0]).not.toBe(paths[1])
    paths[0]!.push('mutated')
    expect(EMPTY_PATH.length).toBe(0)
    const again = s.string().parse(42)
    if (again.ok) throw new Error('expected failure')
    expect(again.issues[0]!.path).toEqual([])
  })
})
