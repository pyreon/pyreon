// Assignment statements (`t = t + x`, `acc += 1`) — subset widening.
//
// `for-of` / `while` / `switch` control-flow statements landed (#1698), but
// every imperative LOOP BODY bailed because the assignment that mutates the
// accumulator — `t = t + x` (an `AssignmentExpression` statement) — was
// unsupported ("`AssignmentExpression` is not supported"). So you could write
// a loop but not accumulate in it. This lowers raw reassignment:
//
//   t = t + x   → Swift `t = t + x`      / Kotlin `t = t + x`
//   acc += 1    → Swift `acc += 1`       / Kotlin `acc += 1`
//
// A reassigned local must also become MUTABLE (`var`, not `let`/`val`) or the
// reassignment is a compile error — `markReassignedLocalsMutable` flips the
// `let` IR's `mutable` flag when a later `assign` targets it.
//
// Signals reassign via `.set()` (a CallExpression), so a raw
// `AssignmentExpression` is ALWAYS a plain local / member / index
// reassignment — never a signal. Only `=` + arithmetic compound ops
// (`+= -= *= /= %=`) lower (both targets take them verbatim); exotic ops
// (`**= &&= ??=` / bitwise) keep the warn-fallback.
//
// Verification rungs (honest):
//  - Kotlin: full `kotlinc` semantic typecheck — a for-of loop accumulating
//    into a `var` (only typechecks when the local is mutable AND the
//    assignment lowers).
//  - Swift: `swiftc -parse` (the harness rung — parse-only) + emit-shape.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import { isSwiftcAvailable, isKotlincAvailable, validateSwift, validateKotlin } from '../validate'

const app = (body: string) =>
  `import { Stack, Text } from '@pyreon/primitives'
function App() {
  const nums = signal<number[]>([1, 2, 3])
${body}
  return (<Stack><Text>x</Text></Stack>)
}`

describe('assignment statements', () => {
  it('lowers `t = t + x` and promotes the reassigned local to mutable (both targets)', () => {
    const body = `  const total = computed(() => {
    let t = 0
    for (const x of nums()) { t = t + x }
    return t
  })`
    for (const tgt of ['swift', 'kotlin'] as const) {
      const out = transform(app(body), { target: tgt }).code
      expect(out).toContain('var t = 0') // reassigned → mutable
      expect(out).toContain('t = t + x') // the assignment lowered
      expect(out).not.toContain('AssignmentExpression')
    }
  })

  it('lowers arithmetic compound assignment (+= -= *= /= %=)', () => {
    const body = `  const f = () => {
    let s = 1
    s += 10
    s -= 2
    s *= 3
    s /= 2
    s %= 5
    return s
  }`
    for (const tgt of ['swift', 'kotlin'] as const) {
      const out = transform(app(body), { target: tgt }).code
      expect(out).toContain('s += 10')
      expect(out).toContain('s *= 3')
      expect(out).toContain('s %= 5')
    }
  })

  it('a NON-reassigned local stays immutable (let / val)', () => {
    const body = `  const f = () => { const k = 5; return k + 1 }`
    expect(transform(app(body), { target: 'swift' }).code).toContain('let k = 5')
    expect(transform(app(body), { target: 'kotlin' }).code).toContain('val k = 5')
  })

  it('an exotic compound op (**=) keeps the warn-fallback (not lowered)', () => {
    const body = `  const f = () => { let s = 2; s **= 3; return s }`
    const r = transform(app(body), { target: 'swift' })
    expect(r.warnings.some((w) => w.includes('AssignmentExpression'))).toBe(true)
  })

  it.skipIf(!isSwiftcAvailable())('Swift: loop-with-accumulator parses via swiftc -parse', () => {
    const out = transform(
      app(`  const total = computed(() => {
    let t = 0
    for (const x of nums()) { t = t + x }
    return t
  })`),
      { target: 'swift' },
    ).code
    const res = validateSwift(out)
    expect(res.ok, res.error ?? '').toBe(true)
  })

  it.skipIf(!isKotlincAvailable())(
    'Kotlin: loop-with-accumulator typechecks via kotlinc (var + assignment)',
    () => {
      const out = transform(
        app(`  const total = computed(() => {
    let t = 0
    for (const x of nums()) { t = t + x }
    return t
  })`),
        { target: 'kotlin' },
      ).code
      const res = validateKotlin(out)
      expect(res.ok, res.error ?? '').toBe(true)
    },
  )
})
