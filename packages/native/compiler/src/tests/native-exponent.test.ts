// Exponent operator (`a ** b`) — subset widening.
//
// `**` previously fell through the parser's arith/comparison maps to a warn +
// WRONG `+` fallback. Neither Swift nor Kotlin has a `**` operator, so it
// lowers to the Double-domain `pow`:
//
//   a ** b   → Swift `pow(Double(a), Double(b))`
//            → Kotlin `Math.pow((a).toDouble(), (b).toDouble())`
//
// The result is Double (matches JS, where `**` yields a Number), so `inferType`
// returns `{ float: true }` for `**` — otherwise a `var x: Int { pow(...) }`
// Swift computed would mismatch its Double body (a typecheck error swiftc
// -parse can't catch). Right-associativity (`2 ** 3 ** 2` = `2 ** (3 ** 2)`)
// is preserved by the AST nesting.
//
// Verification rungs (honest):
//  - Kotlin: full `kotlinc` semantic typecheck (`Math.pow` Double-domain).
//  - Swift: `swiftc -parse` (the harness rung) + emit-shape, incl. the Double
//    computed-type annotation that a real typecheck requires.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import { isSwiftcAvailable, isKotlincAvailable, validateSwift, validateKotlin } from '../validate'

const app = (body: string) =>
  `import { Stack, Text } from '@pyreon/primitives'
function App() {
  const base = signal<number>(2)
${body}
  return (<Stack><Text>x</Text></Stack>)
}`

describe('exponent operator', () => {
  it('Swift: lowers `**` to pow(Double, Double) (no `+` fallback, no warning)', () => {
    const r = transform(app(`  const sq = computed(() => base() ** 2)`), { target: 'swift' })
    expect(r.code).toContain('pow(Double(base), Double(2))')
    expect(r.warnings).toEqual([])
  })

  it('Kotlin: lowers `**` to Math.pow with Double coercion', () => {
    const r = transform(app(`  const sq = computed(() => base() ** 2)`), { target: 'kotlin' })
    expect(r.code).toContain('Math.pow((base).toDouble(), (2).toDouble())')
    expect(r.warnings).toEqual([])
  })

  it('the result type infers as Double (matches the pow body, not Int)', () => {
    // Without the inferType `**` → float rule, the Swift computed would be
    // `var sq: Int { pow(...) }` — a Double body in an Int property.
    const out = transform(app(`  const sq = computed(() => base() ** 2)`), { target: 'swift' }).code
    expect(out).toContain('private var sq: Double')
  })

  it('preserves right-associativity (2 ** 3 ** 2 = 2 ** (3 ** 2))', () => {
    const out = transform(app(`  const c = computed(() => 2 ** 3 ** 2)`), { target: 'swift' }).code
    // outer base is 2, exponent is the inner pow(3,2) → nested
    expect(out).toContain('pow(Double(2), Double(pow(Double(3), Double(2))))')
  })

  it.skipIf(!isSwiftcAvailable())('Swift: exponent emit parses via swiftc -parse', () => {
    const out = transform(
      app(`  const sq = computed(() => base() ** 2)
  const chain = computed(() => 2 ** 3 ** 2)`),
      { target: 'swift' },
    ).code
    const res = validateSwift(out)
    expect(res.ok, res.error ?? '').toBe(true)
  })

  it.skipIf(!isKotlincAvailable())('Kotlin: exponent emit typechecks via kotlinc', () => {
    const out = transform(
      app(`  const sq = computed(() => base() ** 2)
  const chain = computed(() => 2 ** 3 ** 2)`),
      { target: 'kotlin' },
    ).code
    const res = validateKotlin(out)
    expect(res.ok, res.error ?? '').toBe(true)
  })
})
