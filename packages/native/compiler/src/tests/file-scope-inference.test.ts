// `buildInferenceCtx`'s struct table is built PER COMPONENT, and both emitters
// only assign their inference context per component too. A file of pure
// top-level helpers — which is exactly what a GENERATED ENGINE is — therefore
// emitted every expression against an EMPTY context: no structs, so a member
// read typed as `unknown`, and every inference-driven lowering silently skipped
// inside helper bodies.
//
// Seeding a file-scope baseline is the fix, and it was NOT free: an earlier
// attempt made two sites of the generated chart engine stop compiling, because
// better operand types change which Int×Double coercions fire. The cause was
// one level down and is fixed here too — the `Double` ALIAS arrives as an
// unresolved `typeRef`, and any unification that compares `kind`s read it as
// unrelated to `number`. The `binary` case already normalized it; the ternary
// and unary cases did not, so `cond ? 1.0 : someDouble` degraded to `unknown`
// and took every downstream type-gated lowering with it.
import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import { isSwiftUIAvailable, validateSwiftTypecheck } from '../validate'

describe('a member read inside a top-level helper', () => {
  const SRC = `
interface Box { w: Double; h: Double }
interface Handle { id: string }
interface Node { handles?: Handle[] }

function half(b: Box): Double {
  return b.w / 2.0
}
function firstId(n: Node): string {
  const hs = n.handles
  if (hs) { return hs[0].id }
  return ''
}
`
  it('resolves the struct field type — no redundant Double() wrap', () => {
    const { code } = transform(SRC, { target: 'swift' })
    // `b.w` is a Double, so the division needs no coercion at all.
    // The single-return body takes Swift's concise form, so there is no `return`.
    expect(code).toContain('b.w / 2.0')
    expect(code).not.toContain('Double(b.w)')
  })

  it('resolves an optional field, so the condition binds', () => {
    const { code } = transform(SRC, { target: 'swift' })
    expect(code).toContain('if let hs {')
  })
})

describe('the Double alias unifies with a numeric literal', () => {
  const SRC = `
interface Spec { progress?: Double }
interface Pt { x: Double }
function cutOf(spec: Spec, pts: Pt[]): Double {
  const raw = spec.progress ?? 1.0
  const progress = raw < 0.0 ? 0.0 : raw > 1.0 ? 1.0 : raw
  const span = pts.length - 1
  return span * progress
}
`
  it('types the ternary as Double, so the Int operand is coerced', () => {
    const { code } = transform(SRC, { target: 'swift' })
    // Without the alias normalization the ternary degraded to `unknown`, the
    // Int×Double rule never fired, and `span * progress` did not compile.
    expect(code).toContain('Double(span) * progress')
  })

  it('compiles', () => {
    if (!isSwiftUIAvailable()) return
    const r = validateSwiftTypecheck(transform(SRC, { target: 'swift' }).code)
    expect(r.ok, r.error ?? '').toBe(true)
  })

  it('keeps a negation over an alias-typed field a Double', () => {
    const src = `
interface Rect { w: Double }
function absW(r: Rect): Double {
  return r.w < 0.0 ? -r.w : r.w
}
`
    const { code } = transform(src, { target: 'swift' })
    // `-r.w` is a Double; reading the unresolved typeRef as "not a number"
    // typed it Int and put a redundant `Double(...)` around the negation.
    expect(code).not.toContain('Double(-r.w)')
  })
})
