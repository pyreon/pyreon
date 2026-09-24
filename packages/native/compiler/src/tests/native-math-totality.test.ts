// TOTALITY lock for `Math.*` on both native targets.
//
// THE SHAPE THIS EXISTS TO PREVENT: each emitter recognised a SET of Math
// members (Swift's `SWIFT_MATH_DOUBLE` + its switch, Kotlin's
// `JAVA_MATH_DOUBLE` + `KOTLIN_MATH_REMAP`), each set had a test exercising
// exactly that set, and anything outside it fell through to a verbatim
// `Math.x(...)` emit with ZERO warnings. Measured on the real toolchains
// before this file existed — Swift `cannot find 'Math' in scope` for
// `sign expm1 log1p asinh acosh atanh fround clz32 imul random` and every
// constant but `PI`; Kotlin `unresolved reference` for
// `asinh acosh atanh fround clz32 imul LN2 LN10 LOG2E LOG10E SQRT2 SQRT1_2`
// and an `argument type mismatch` for `expm1 log1p floor(Int) ceil(Int)
// round(Int)`; BOTH for the variadic `Math.max(a, b, c)` / `Math.min(...)` /
// `Math.hypot(a, b, c)` forms ECMAScript specifies.
//
// The ONLY assertion that closes a hole like that is a TOTAL one: pin the
// ECMAScript member list and require each member to be either lowered-and-
// COMPILING or WARNED BY NAME. A per-member spec can only ever re-state the
// set its author already thought of.
//
// TWO deliberate choices:
//  • The member list below is the ECMAScript LANGUAGE surface, hand-written.
//    Enumerating the runtime's own `Math` would drift with the engine (Bun
//    carries `f16round` / `sumPrecise` proposals PMTC never promised).
//  • Verification runs on the swiftc `-typecheck` rung, NOT `swiftc -parse`.
//    `Math.sign(-3)` PARSES fine — the parse rung cannot observe any member
//    of this bug class, which is precisely why the pre-existing
//    `native-swift-math.test.ts` stayed green while ten members were broken.
//
// Bisect-load-bearing: revert the `lowerMathCall` call site in either emitter
// and the totality spec fails naming the members that regressed.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import { ECMASCRIPT_MATH_CONSTANTS, ECMASCRIPT_MATH_FUNCTIONS } from '../math-lowering'
import {
  isKotlincAvailable,
  isSwiftUIAvailable,
  validateKotlin,
  validateSwiftTypecheck,
} from '../validate'

type Target = 'swift' | 'kotlin'

/** Every Math member as a source expression, at its ECMAScript arity. */
const MEMBER_EXPRS: readonly (readonly [string, string])[] = [
  ...Object.entries(ECMASCRIPT_MATH_FUNCTIONS).map(
    ([fn, arity]) =>
      [
        fn,
        `Math.${fn}(${Array.from({ length: arity }, (_, i) => String(i + 2)).join(', ')})`,
      ] as const,
  ),
  ...ECMASCRIPT_MATH_CONSTANTS.map((c) => [c, `Math.${c}`] as const),
  // The VARIADIC forms ECMAScript specifies — outside every fixed-arity set.
  ['max', 'Math.max(1, 2, 3)'],
  ['min', 'Math.min(4, 2, 7, 1)'],
  ['hypot', 'Math.hypot(3, 4, 12)'],
]

const app = (body: string) =>
  `import { Stack, Text } from '@pyreon/primitives'
function App() {
${body}
  return (<Stack><Text>x</Text></Stack>)
}`

const one = (expr: string, target: Target) =>
  transform(app(`  const v = computed(() => ${expr})`), { target })

/** Members with no honest platform form — named, never half-lowered. */
const WARNED = new Set(['clz32', 'imul'])

describe('Math.* totality — every ECMAScript member lowers or is named', () => {
  for (const target of ['swift', 'kotlin'] as const) {
    it(`${target}: no member falls through silently`, () => {
      const silent: string[] = []
      for (const [name, expr] of MEMBER_EXPRS) {
        const r = one(expr, target)
        const named = r.warnings.some((w) => w.includes(`Math.${name}`))
        if (WARNED.has(name)) {
          expect(named, `${expr} must be WARNED BY NAME`).toBe(true)
          continue
        }
        if (named) silent.push(`${expr} — unexpectedly warned`)
        // Swift has no `Math` namespace at all: any surviving `Math.` in the
        // emitted expression is the fall-through this file exists to catch.
        if (target === 'swift' && /\bMath\./.test(r.code))
          silent.push(`${expr} — left a bare Math.`)
      }
      expect(silent, silent.join('\n')).toEqual([])
    })
  }

  it('the warned members carry the remedy, not just a name', () => {
    for (const m of WARNED) {
      const w = one(`Math.${m}(1, 2)`, 'swift').warnings.join('\n')
      expect(w, m).toContain(`Math.${m}`)
      expect(w, m).toContain('no native lowering')
    }
  })

  // ONE toolchain invocation per target: a per-member loop is 40+ cold
  // swiftc/kotlinc starts and blows the timeout (the lesson recorded in
  // `native-kotlin-math.test.ts`).
  const bundle = (target: Target) => {
    const lowered = MEMBER_EXPRS.filter(([n]) => !WARNED.has(n))
    return transform(
      app(lowered.map(([, e], i) => `  const v${i} = computed(() => ${e})`).join('\n')),
      { target },
    ).code
  }

  it.skipIf(!isSwiftUIAvailable())('iOS: every lowered member typechecks via swiftc', () => {
    const r = validateSwiftTypecheck(bundle('swift'))
    expect(r.ok, r.error ?? '').toBe(true)
  })

  it.skipIf(!isKotlincAvailable())('Android: every lowered member compiles via kotlinc', () => {
    const r = validateKotlin(bundle('kotlin'))
    expect(r.ok, r.error ?? '').toBe(true)
  })

  // Spot-locks for the shapes whose CORRECTNESS (not just compilability) is
  // the point — a wrong-but-compiling form is the worse half of this class.
  it('constants are the ECMAScript doubles on BOTH targets, not a platform table', () => {
    expect(one('Math.SQRT2', 'swift').code).toContain('1.4142135623730951')
    expect(one('Math.SQRT2', 'kotlin').code).toContain('1.4142135623730951')
    expect(one('Math.LN2', 'swift').code).toContain('0.6931471805599453')
    expect(one('Math.LN2', 'kotlin').code).toContain('0.6931471805599453')
  })

  it('a Math constant infers Double, not Any', () => {
    expect(one('Math.SQRT2', 'swift').code).toContain('private var v: Double')
    expect(one('Math.SQRT2', 'swift').code).not.toContain('v: Any')
  })

  it('n-ary max/min NEST rather than emitting a 3-arg platform call', () => {
    expect(one('Math.max(1, 2, 3)', 'swift').code).toContain('max(1, max(2, 3))')
    expect(one('Math.max(1, 2, 3)', 'kotlin').code).toContain('Math.max(1, Math.max(2, 3))')
  })

  it('n-ary hypot evaluates each argument ONCE (pow, never x * x)', () => {
    const sw = one('Math.hypot(a(), b(), c())', 'swift').code
    expect(sw).toContain('pow(Double(a), 2)')
    expect(sw).not.toContain('Double(a) * Double(a)')
  })

  it('Math.sign infers Double and evaluates its argument once on Swift', () => {
    const sw = one('Math.sign(n())', 'swift').code
    expect(sw).toContain('private var v: Double')
    expect(sw).toContain('(Double(n))')
    // exactly one read of `n` in the lowered expression
    expect(sw.match(/Double\(n\)/g) ?? []).toHaveLength(1)
  })

  it('Kotlin floor/ceil/round coerce an INT arg and leave the Double emit alone', () => {
    expect(one('Math.floor(1)', 'kotlin').code).toContain('Math.floor((1).toDouble())')
    // the string the pre-existing lock pins — unchanged.
    expect(one('Math.floor(3.7)', 'kotlin').code).toContain('Math.floor(3.7)')
  })
})
