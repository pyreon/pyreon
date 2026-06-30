// Kotlin Math.* Double-domain coercion + remap — correctness widening.
//
// `Math.sqrt(16)` etc. emitted the generic passthrough `Math.sqrt(16)`, which
// resolves to `java.lang.Math.sqrt(double)` but REJECTS the Int arg ("type
// mismatch" — Kotlin doesn't auto-widen Int→Double for a java method), and
// `sign`/`trunc`/`log2` don't exist on java.lang.Math at all. So 13 common
// Double-domain Math functions emitted clean-looking-but-uncompilable Kotlin
// (a silent-wrong-emit — no warning, fails kotlinc). The fix coerces every
// arg `.toDouble()` (identity on a Double, so it's safe for any arg type) and
// remaps the three non-java fns to `kotlin.math`:
//
//   Math.sqrt(16)   → Math.sqrt((16).toDouble())
//   Math.pow(2, 3)  → Math.pow((2).toDouble(), (3).toDouble())
//   Math.sign(-3)   → kotlin.math.sign((-3).toDouble())
//   Math.trunc(3.7) → kotlin.math.truncate((3.7).toDouble())
//
// Int-friendly fns (abs/max/min) + floor/ceil/round + constants stay on the
// generic passthrough (they already validate). Swift parses its Math fine
// (free functions + literal inference) — this is Kotlin-only.
//
// Verification: full `kotlinc` semantic typecheck — the rung that was failing.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import { isKotlincAvailable, validateKotlin } from '../validate'

const app = (expr: string) =>
  `import { Stack, Text } from '@pyreon/primitives'
function App() {
  const v = computed(() => ${expr})
  return (<Stack><Text>x</Text></Stack>)
}`

const kt = (expr: string) => transform(app(expr), { target: 'kotlin' }).code

describe('Kotlin Math.* Double-domain coercion', () => {
  it('coerces args for java.lang.Math Double-domain fns', () => {
    expect(kt('Math.sqrt(16)')).toContain('Math.sqrt((16).toDouble())')
    expect(kt('Math.pow(2, 3)')).toContain('Math.pow((2).toDouble(), (3).toDouble())')
    expect(kt('Math.hypot(3, 4)')).toContain('Math.hypot((3).toDouble(), (4).toDouble())')
    expect(kt('Math.sin(1)')).toContain('Math.sin((1).toDouble())')
  })

  it('remaps non-java fns to kotlin.math (sign / trunc / log2)', () => {
    expect(kt('Math.sign(-3)')).toContain('kotlin.math.sign((-3).toDouble())')
    expect(kt('Math.trunc(3.7)')).toContain('kotlin.math.truncate((3.7).toDouble())')
    expect(kt('Math.log2(8)')).toContain('kotlin.math.log2((8).toDouble())')
  })

  it('leaves Int-friendly fns + floor/ceil as passthrough (no coercion)', () => {
    expect(kt('Math.abs(-5)')).toContain('Math.abs(-5)')
    expect(kt('Math.max(1, 2)')).toContain('Math.max(1, 2)')
    expect(kt('Math.floor(3.7)')).toContain('Math.floor(3.7)')
  })

  it('Swift coerces with its OWN Double() form (not Kotlin .toDouble())', () => {
    // Swift also coerces Double-domain Math args (its own fix), but with
    // `Double(x)` — NOT Kotlin's `(x).toDouble()`. This asserts the two
    // targets use their respective idioms.
    const sw = transform(app('Math.sqrt(16)'), { target: 'swift' }).code
    expect(sw).toContain('sqrt(Double(16))')
    expect(sw).not.toContain('toDouble')
  })

  it.skipIf(!isKotlincAvailable())(
    'Kotlin: all 13 previously-failing Double-domain Math fns now typecheck via kotlinc',
    () => {
      // ONE component with all 13 fns → ONE kotlinc invocation. (A per-expr
      // loop is 13 separate kotlinc runs — cold JVM startup × 13 blows the
      // 60s test timeout on CI; locally a warm kotlinc hid it.)
      const exprs = [
        'Math.sqrt(16)', 'Math.cbrt(8)', 'Math.pow(2, 3)', 'Math.hypot(3, 4)',
        'Math.sin(1)', 'Math.cos(1)', 'Math.tan(1)', 'Math.atan2(1, 2)',
        'Math.log(2)', 'Math.log10(100)', 'Math.exp(1)', 'Math.sign(-3)',
        'Math.trunc(3.7)',
      ]
      const body = exprs.map((e, i) => `  const v${i} = computed(() => ${e})`).join('\n')
      const out = transform(
        `import { Stack, Text } from '@pyreon/primitives'
function App() {
${body}
  return (<Stack><Text>x</Text></Stack>)
}`,
        { target: 'kotlin' },
      ).code
      const res = validateKotlin(out)
      expect(res.ok, res.error ?? '').toBe(true)
    },
  )
})
