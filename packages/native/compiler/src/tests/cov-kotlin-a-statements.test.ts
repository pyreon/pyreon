// Coverage: `emitKotlinStatement` (emit-kotlin.ts ~3460-3720) — the let /
// assign / expr / loop / switch arms.
//
// The recurring hazard in this block is Int-vs-Double: a Kotlin IntRange
// cannot be seeded from a Double, and an integral literal under a `Double`
// annotation emits an Int that then poisons every expression it takes part
// in ("binary operator '*' cannot be applied to 'Int' and 'Double'"). So the
// specs pair each rounding decision with its neighbour rather than asserting
// "a loop was emitted".

import { describe, expect, it } from 'vitest'
import { transform } from '../index'

const SRC = (body: string) => `import { Stack, Text, Press } from '@pyreon/primitives'
function App() {
  const n = signal<number>(0)
  const lim = signal<number>(2.5)
  const run = () => {
${body}
  }
  return (<Stack><Press onPress={run}><Text>go</Text></Press></Stack>)
}`

const kt = (body: string) => transform(SRC(body), { target: 'kotlin' }).code

describe('Kotlin statements: let declarations', () => {
  it('an INTEGRAL literal under a Double annotation emits `1.0` — val and var alike', () => {
    const out = kt(`    const scale: Double = 1
    let mscale: Double = 2
    mscale = 3
    n.set(scale + mscale)`)
    expect(out).toContain('val scale = 1.0')
    expect(out).toContain('var mscale = 2.0')
  })

  it('an EMPTY literal keeps the declared annotation (nothing else states the type)', () => {
    expect(kt(`    const empty: number[] = []
    n.set(empty.length)`)).toContain('val empty: List<Int> = listOf()')
  })

  it('a MUTATED empty array needs the mutable pair; a non-empty one infers from its elements', () => {
    const out = kt(`    const acc: number[] = []
    acc.push(1)
    const seeded = [1, 2]
    seeded.push(3)
    n.set(acc.length + seeded.length)`)
    // `List` has no `add`, and `listOf()` is immutable — `val` still correct
    expect(out).toContain('val acc: MutableList<Int> = mutableListOf()')
    // element type comes from the elements, so no annotation
    expect(out).toContain('val seeded = mutableListOf(1, 2)')
  })
})

describe('Kotlin statements: `i++` / `i--` as a STATEMENT', () => {
  it('becomes `+= 1` / `-= 1` (the value-position form returns the OLD value)', () => {
    const out = kt(`    let i = 0
    i++
    i--
    n.set(i)`)
    expect(out).toContain('i += 1')
    expect(out).toContain('i -= 1')
  })
})

describe('Kotlin statements: labelled loops', () => {
  it('while/for-of carry `label@`, and break/continue carry `@label`', () => {
    const out = kt(`    let i = 0
    outer: while (i < 10) { i++; if (i > 3) break outer }
    loopy: for (const x of [1, 2, 3]) { if (x === 2) continue loopy }
    n.set(i)`)
    expect(out).toContain('outer@ while (')
    expect(out).toContain('break@outer')
    expect(out).toContain('loopy@ for (x in listOf(1, 2, 3))')
    expect(out).toContain('continue@loopy')
  })

  it('an UNlabelled break/continue stays bare', () => {
    const out = kt(`    let i = 0
    while (i < 10) { i++; if (i > 3) break; if (i === 2) continue }
    n.set(i)`)
    expect(out).toMatch(/^\s+break$/m)
    expect(out).toMatch(/^\s+continue$/m)
    expect(out).not.toContain('break@')
  })
})

describe('Kotlin statements: for-range rounding when a bound is a Double', () => {
  it('ASCENDING: exclusive `i < n` is ceil(n); inclusive `i <= n` is floor(n)', () => {
    const out = kt(`    for (let i = 0; i < lim(); i++) { n.set(i) }
    for (let i = 0; i <= lim(); i++) { n.set(i) }`)
    // JS `i < n` trips ceil(n) times for fractional n
    expect(out).toContain('for (i in 0 until Math.ceil(lim).toInt())')
    expect(out).toContain('for (i in 0..Math.floor(lim).toInt())')
  })

  it('DESCENDING: `i >= n` bottoms at ceil(n); `i > n` at floor(n)+1 (downTo is inclusive-only)', () => {
    const out = kt(`    for (let i = 5; i >= lim(); i--) { n.set(i) }
    for (let i = 5; i > lim(); i--) { n.set(i) }`)
    expect(out).toContain('5 downTo Math.ceil(lim).toInt()')
    expect(out).toContain('5 downTo (Math.floor(lim).toInt() + 1)')
  })

  it('a Double FROM bound walks as an Int: floor when descending, ceil when ascending', () => {
    const out = kt(`    for (let i = lim(); i >= 0; i--) { n.set(i) }
    for (let i = lim(); i < 9; i++) { n.set(i) }`)
    expect(out).toContain('Math.floor(lim).toInt() downTo 0')
    expect(out).toContain('for (i in Math.ceil(lim).toInt() until 9)')
  })

  it('an INT bound is left alone, and a literal step > 1 appends `step K`', () => {
    const out = kt(`    for (let i = 0; i < 10; i += 2) { n.set(i) }`)
    expect(out).toContain('for (i in 0 until 10 step 2)')
    expect(out).not.toContain('Math.ceil(10)')
  })
})

describe('Kotlin statements: do-while and switch', () => {
  it('do-while keeps its post-condition', () => {
    expect(kt(`    do { n.set(n() + 1) } while (n() < 3)`)).toContain('} while (n < 3)')
  })

  it('a switch becomes `when`, and an EMPTY case body emits `{}` rather than a blank block', () => {
    const out = kt(`    let i = 0
    switch (i) {
      case 1:
        break
      case 2:
      case 3:
        n.set(9)
        break
      default:
        n.set(0)
    }`)
    expect(out).toContain('when (i) {')
    expect(out).toContain('1 -> {}')
    // multi-test case labels are comma-joined
    expect(out).toContain('2, 3 -> {')
    expect(out).toContain('else -> {')
  })
})

// ─────────────────────────── KNOWN BUG ───────────────────────────
//
// `const scale: Double = 1` emits `1.0` inside a FUNCTION BODY and `1`
// at COMPONENT scope — so whether a file builds depends on which scope
// the declaration sits in.
//
// The emit knows the rule: `emitKotlinStatement`'s `let` arm carries a
// docblock for exactly this ("the annotation is the only place that type
// exists … it emitted `1`, an Int, which then poisons every expression it
// takes part in"), and emits `1.0` when a `Double`/`Float` annotation meets
// an integral literal. `emitKotlinDecl`'s `d.kind === 'value'` arm — the
// component-scope twin — has no such branch, so the same declaration one
// scope up emits `val scale = 1`.
//
// COMPILE-PROVEN with the real toolchain, not inferred. Given
// `function takesD(d: Double)`, `takesD(scale)`:
//
//   scale declared INSIDE `run()`   → validateKotlin ok
//   scale declared at COMPONENT scope → kotlinc:
//     error: argument type mismatch: actual type is 'Int',
//            but 'Double' was expected.   takesD(scale)
//
// The Swift backend has the same split (`let scale = 1` at component
// scope; `let inner = 1.0` in a body), so this is one shared defect, not a
// Kotlin quirk — and both are a hard call-site error, since neither
// language widens Int→Double implicitly.
//
// FIX: apply the same integral-literal-under-a-Double-annotation branch in
// `emitKotlinDecl`'s value arm (and its `emitSwiftDecl` twin) — ideally by
// extracting the predicate the statement arm already uses, so the two
// scopes cannot disagree again.
//
// This spec passes the moment the component-scope emit matches; delete the
// `.fails` then.
describe('Kotlin decls: a `Double` annotation at COMPONENT scope', () => {
  it.fails('KNOWN BUG: an integral literal under a Double annotation emits an Int at component scope', () => {
    const out = transform(
      `import { Stack, Text, Press } from '@pyreon/primitives'
function takesD(d: Double): Double { return d * 2 }
export function App() {
  const scale: Double = 1
  const run = () => { takesD(scale) }
  return (<Stack><Press onPress={run}><Text>go</Text></Press></Stack>)
}`,
      { target: 'kotlin' },
    ).code
    expect(out, 'component-scope Double annotation should emit 1.0, as the body-scope twin does').toContain(
      'val scale = 1.0',
    )
  })
})
