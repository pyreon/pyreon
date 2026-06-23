// Mixed Int×Double arithmetic + unary-minus float (type-inference widening).
//
// (1) MIXED Int×Double operand coercion. Swift has NO implicit Int→Double
// conversion, so `count() * 0.5` (Int signal × fractional literal) is a
// `swiftc` type error. The binary emit now infers each operand's float-ness
// (via the component's inference ctx, exposed to expr-emit through
// `_activeInferCtx`) and coerces the INT side to `Double(...)` when EXACTLY
// one operand is Double. Kotlin AUTO-PROMOTES Int×Double (`Int.times(Double):
// Double`), so it needs no coercion — emit stays verbatim. `%` is excluded
// (Swift Double `%` needs `.truncatingRemainder`).
//
// (2) UNARY-MINUS preserves float. `inferType` for `-x` / `+x` now keeps the
// argument's float-ness (`-rate()` over a Double infers Double, not Int), so a
// computed/function returning it gets the correct `Double` annotation.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import { isSwiftcAvailable, isKotlincAvailable, validateSwift, validateKotlin } from '../validate'

const app = (body: string) =>
  `import { Stack, Text } from '@pyreon/primitives'
function App() {
  const count = signal(3)
  const rate = signal(0.5)
${body}
  return (<Stack><Text>x</Text></Stack>)
}`

describe('mixed Int×Double + unary-minus float', () => {
  it('Swift: coerces the Int side of an Int×Double product/sum', () => {
    const out = transform(
      app(`  const a = count() * 0.5
  const b = 0.5 * count()
  const d = rate() * count()`),
      { target: 'swift' },
    ).code
    expect(out).toContain('let a = Double(count) * 0.5')
    expect(out).toContain('let b = 0.5 * Double(count)')
    expect(out).toContain('let d = rate * Double(count)')
  })

  it('Swift: does NOT coerce when both sides are the same numeric kind', () => {
    const out = transform(
      app(`  const c = count() + 2
  const e = rate() * rate()`),
      { target: 'swift' },
    ).code
    expect(out).toContain('let c = count + 2') // Int + Int
    expect(out).toContain('let e = rate * rate') // Double * Double
    expect(out).not.toContain('Double(count) + 2')
  })

  it('Kotlin: no coercion needed (Int×Double auto-promotes)', () => {
    const out = transform(
      app(`  const a = count() * 0.5
  const d = rate() * count()`),
      { target: 'kotlin' },
    ).code
    expect(out).toContain('val a = count * 0.5')
    expect(out).toContain('val d = rate * count')
    expect(out).not.toContain('toDouble')
  })

  it('Swift: unary minus over a Double infers Double (computed annotation)', () => {
    const sw = transform(app(`  const neg = computed(() => -rate())`), { target: 'swift' }).code
    // Double-returning computed annotated `Double` (was `Int` → swiftc error
    // assigning a Double body to an Int-typed computed). Kotlin doesn't
    // annotate computeds (kotlinc infers the type from `derivedStateOf`), so
    // this is a Swift-only annotation contract — Kotlin is covered by the
    // kotlinc-validation test below.
    expect(sw).toContain('var neg: Double')
  })

  it.skipIf(!isSwiftcAvailable())('Swift: mixed-numeric arithmetic typechecks via swiftc', () => {
    const out = transform(
      app(`  const a = count() * 0.5
  const b = 0.5 * count()
  const d = rate() * count()
  const neg = computed(() => -rate())`),
      { target: 'swift' },
    ).code
    const res = validateSwift(out)
    expect(res.ok, res.error ?? '').toBe(true)
  })

  it.skipIf(!isKotlincAvailable())('Kotlin: mixed-numeric arithmetic typechecks via kotlinc', () => {
    const out = transform(
      app(`  const a = count() * 0.5
  const b = 0.5 * count()
  const d = rate() * count()
  const neg = computed(() => -rate())`),
      { target: 'kotlin' },
    ).code
    const res = validateKotlin(out)
    expect(res.ok, res.error ?? '').toBe(true)
  })
})
