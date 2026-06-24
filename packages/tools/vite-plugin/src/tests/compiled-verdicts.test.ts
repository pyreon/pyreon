// buildCompiledVerdicts() — the build-only `@pyreon/vite-plugin` pass that
// appends `X._attachCompiledVerdict(…)` to every module-level, fully-emittable
// `const X = s.<schema>` so the runtime `X.is(v)` runs an inlined validator
// instead of `X.parse(v).ok`. The emitted verdict is byte-equivalent to the
// runtime (locked by the compiler's emit-equivalence gate) — these tests cover
// the WIRING: which schemas get a tail, and that the eval'd verdict is correct.
import { describe, expect, it } from 'vitest'
import { buildCompiledVerdicts } from '../index'

describe('buildCompiledVerdicts — compiled validator emission', () => {
  it('emits a guarded boolean attach-call for a top-level emittable schema', () => {
    const out = buildCompiledVerdicts(`const Email = s.string().email()`, 'x.ts')
    expect(out).toContain('Email._attachCompiledVerdict(')
    expect(out).toContain('.length === 0') // issues-array → boolean verdict
    expect(out).toContain('catch { return false }') // never throws on bad input
  })

  it('skips function/block-scoped schemas (module-end attach would ReferenceError)', () => {
    expect(buildCompiledVerdicts(`function f(){ const Local = s.string() }`, 'x.ts')).toBe('')
    expect(buildCompiledVerdicts(`const f = () => { const L = s.number() }`, 'x.ts')).toBe('')
    expect(buildCompiledVerdicts(`{ const B = s.boolean() }`, 'x.ts')).toBe('')
  })

  it('skips non-emittable (unsupported IR) schemas — falls back to runtime .is()', () => {
    expect(buildCompiledVerdicts(`const X = s.string().refine(v => true)`, 'x.ts')).toBe('')
    expect(buildCompiledVerdicts(`const X = s.record(s.number())`, 'x.ts')).toBe('')
  })

  it('skips anonymous (destructured) bindings — no name to attach to', () => {
    expect(buildCompiledVerdicts(`const { X } = s.object({})`, 'x.ts')).toBe('')
  })

  it('emits one attach-call per top-level schema', () => {
    const out = buildCompiledVerdicts(`const A = s.string()\nconst B = s.number().int()`, 'x.ts')
    expect(out).toContain('A._attachCompiledVerdict(')
    expect(out).toContain('B._attachCompiledVerdict(')
  })

  it("the eval'd verdict computes the correct boolean (and never throws on bad input)", () => {
    const out = buildCompiledVerdicts(`const Age = s.number().int().min(18)`, 'x.ts')
    let verdict: ((v: unknown) => boolean) | null = null
    const Age = {
      _attachCompiledVerdict(fn: (v: unknown) => boolean) {
        verdict = fn
        return this
      },
    }
    // oxlint-disable-next-line no-new-func
    new Function('Age', out)(Age)
    expect(verdict).toBeTypeOf('function')
    const v = verdict as unknown as (x: unknown) => boolean
    expect(v(25)).toBe(true) // int ≥ 18
    expect(v(17)).toBe(false) // < 18
    expect(v(3.5)).toBe(false) // not int
    expect(v('x')).toBe(false) // wrong type — must NOT throw
    expect(v(null)).toBe(false)
  })

  it("the eval'd object verdict matches runtime parse semantics on null/wrong-type", () => {
    const out = buildCompiledVerdicts(`const U = s.object({ email: s.string().email() })`, 'x.ts')
    let verdict: ((v: unknown) => boolean) | null = null
    const U = {
      _attachCompiledVerdict(fn: (v: unknown) => boolean) {
        verdict = fn
        return this
      },
    }
    // oxlint-disable-next-line no-new-func
    new Function('U', out)(U)
    const v = verdict as unknown as (x: unknown) => boolean
    expect(v({ email: 'a@b.co' })).toBe(true)
    expect(v({ email: 'nope' })).toBe(false)
    expect(v(null)).toBe(false) // object schema on null → false, never throws
  })
})
