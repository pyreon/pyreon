/**
 * The OWN-PROPERTY parse seam for pure-JIT trees (see `installOwnParse` in
 * core/schema.ts): after the first parse, a fully-inline compiled schema
 * carries `parse` as an own property closing over its `_compiled` artifact
 * and reused ctx, so the hot call has no `this` loads and a per-schema
 * monomorphic target. Measured on the process-isolated four-cell runner:
 * `number.int.range` 5.02 → 4.63ns (two runs), deep cells unchanged.
 *
 * What these specs lock is not the speed but the CONTRACT that makes it safe:
 *   - the closure is built in the same pass as the artifact it captures and
 *     is DELETED with it on invalidation (a chained op after use), so the two
 *     can never disagree — the same snapshot rule `.is()`'s verdict follows;
 *   - a non-pure tree (user code in the chain) never gets one;
 *   - a subclass that overrides `parse` keeps its override;
 *   - results are identical to the prototype seam on both verdict branches.
 */
import { Schema } from '../core/schema'
import { s } from '../index'

const own = (x: unknown) => Object.hasOwn(x as object, 'parse')

describe('own-property parse seam (pure JIT trees)', () => {
  it('is installed by the first parse of a pure tree and answers like the prototype seam', () => {
    const S = s.number().int().min(0).max(150)
    expect(own(S)).toBe(false)
    expect(S.parse(42)).toEqual({ ok: true, value: 42 })
    expect(own(S)).toBe(true)
    expect(S.parse(42)).toEqual({ ok: true, value: 42 })
    const bad = S.parse(1.5)
    expect(bad.ok).toBe(false)
    // The prototype seam, forced, agrees on both branches.
    const proto = Schema.prototype.parse.call(S, 1.5)
    expect(proto.ok).toBe(false)
    expect(JSON.stringify(proto)).toBe(JSON.stringify(S.parse(1.5)))
    expect(Schema.prototype.parse.call(S, 7)).toEqual(S.parse(7))
  })

  it('a pure object tree gets one too, and its strip-clone semantics are unchanged', () => {
    const S = s.object({ a: s.string(), n: s.number() })
    const input = { a: 'x', n: 1, extra: true }
    const r = S.parse(input)
    expect(own(S)).toBe(true)
    expect(r).toEqual({ ok: true, value: { a: 'x', n: 1 } })
    expect((r as { value: unknown }).value).not.toBe(input)
  })

  it('a chained op AFTER use drops the own seam with the stale artifact, and the next parse rebuilds both', () => {
    const S = s.number().int()
    expect(S.parse(200).ok).toBe(true)
    expect(own(S)).toBe(true)
    // Chaining is copy-on-write, so exercise the invalidation seam directly
    // (it still guards any internal op-list change).
    const derived = S.max(150)
    expect(own(derived)).toBe(false)
    expect(derived.parse(200).ok).toBe(false)
    expect(own(S)).toBe(true)
    expect(S.parse(200).ok).toBe(true)
    S._ops = derived._ops
    S._invalidateCompile()
    expect(own(S)).toBe(false)
    // The rebuilt tree must reject what the stale closure would have accepted.
    expect(S.parse(200).ok).toBe(false)
    expect(S.parse(20).ok).toBe(true)
    expect(own(S)).toBe(true)
    // `.is()` and `.parse().ok` still agree after the rebuild.
    expect(S.is(200)).toBe(false)
    expect(S.is(20)).toBe(true)
  })

  it('a NON-pure tree (user code in the chain) never gets an own seam', () => {
    const S = s.number().refine((n) => n % 2 === 0, { message: 'even' })
    expect(S.parse(2).ok).toBe(true)
    expect(S.parse(3).ok).toBe(false)
    expect(own(S)).toBe(false)
  })

  it('a subclass that overrides parse keeps its override', () => {
    const S = s.number()
    const marker = { ok: true as const, value: -1 }
    const Sub = Object.create(S) as typeof S & { parse: () => typeof marker }
    Sub.parse = () => marker
    // Force a fresh compile through the overriding instance.
    ;(Sub as unknown as { _invalidateCompile(): void })._invalidateCompile()
    expect(Sub.parse()).toBe(marker)
    expect((Sub as unknown as { _getCompiledForSeam(): unknown })._getCompiledForSeam()).toBeTypeOf('function')
    expect(Sub.parse()).toBe(marker)
  })
})

// The OWN-PROPERTY `is`: once the verdict JIT serves a schema, `schema.is` IS
// the verdict function — same snapshot and invalidation contract as `parse`.
describe('own-property is (verdict JIT)', () => {
  const ownIs = (x: unknown) => Object.hasOwn(x as object, 'is')

  it('is installed by the first compile and is dropped and rebuilt with the artifacts', () => {
    const S = s.number().int()
    expect(ownIs(S)).toBe(false)
    expect(S.is(200)).toBe(true)
    expect(ownIs(S)).toBe(true)
    // A chained derivative never inherits the receiver's verdict.
    const derived = S.max(150)
    expect(ownIs(derived)).toBe(false)
    expect(derived.is(200)).toBe(false)
    // Direct op-list change + invalidation: the stale verdict goes with it.
    S._ops = derived._ops
    S._invalidateCompile()
    expect(ownIs(S)).toBe(false)
    expect(S.is(200)).toBe(false)
    expect(S.is(20)).toBe(true)
    expect(S.parse(200).ok).toBe(false)
  })

  it('a shape the verdict JIT refuses keeps the prototype method', () => {
    const S = s.string().refine((v) => v !== 'no', { message: 'nope' })
    expect(S.is('ok')).toBe(true)
    expect(S.is('no')).toBe(false)
    expect(ownIs(S)).toBe(false)
  })

  it('a destructured is works once installed', () => {
    const S = s.object({ a: s.string() })
    S.parse({ a: 'x' })
    const { is } = S
    expect(is({ a: 'x' })).toBe(true)
    expect(is({ a: 1 })).toBe(false)
  })
})
