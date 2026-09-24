// An integer literal in a DOUBLE position emits as a Double.
//
// The annotation is evidence. `Record<string, Double> = { '2024-01-03': 4 }` is
// the natural way to write a count — a calendar's values ARE integers — and it
// emitted `MutableMap<String, Int>` against a `MutableMap<String, Double>`
// annotation, which does not compile. It read perfectly on the web, so the
// first sign of it was Android refusing an example app.
//
// The fix is at the literal emit rather than in a new refinement pass, because
// every position that carries an expected type already threads it there: map
// values, array elements, struct fields, call arguments. One condition covers
// all of them and any position added later.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import { isKotlincAvailable, isSwiftcAvailable, validateKotlin, validateSwiftWithStubs } from '../validate'

const app = (body: string): string => `import { Stack, Text } from '@pyreon/primitives'
${body}
export function P() {
  return (<Stack><Text>ok</Text></Stack>)
}`

const MAP = app(`const COUNTS: Record<string, Double> = { mon: 4, tue: 9, wed: 2.5 }`)
const INTS = app(`const NS: number[] = [1, 2, 3]`)

describe('an integer literal in a Double position', () => {
  it('Kotlin: a Record<string, Double> keeps its values Double', () => {
    const code = transform(MAP, { target: 'kotlin' }).code
    expect(code).toContain('"mon" to 4.0')
    expect(code).toContain('"tue" to 9.0')
    // A genuinely fractional value was already fine and must not gain a second
    // decimal.
    expect(code).toContain('"wed" to 2.5')
  })

  it('Swift: the same', () => {
    const code = transform(MAP, { target: 'swift' }).code
    expect(code).toContain('"mon": 4.0')
    expect(code).toContain('"wed": 2.5')
  })

  it('leaves a genuine INT position alone', () => {
    // The guard that keeps this from being a blanket "every integer is a
    // Double": nothing here asks for a Double, so nothing gains a `.0`.
    for (const target of ['swift', 'kotlin'] as const) {
      const code = transform(INTS, { target }).code
      expect(code, target).not.toContain('1.0')
      expect(code, target).toMatch(/\[?1, 2, 3/)
    }
  })

  it('does NOT reach an index, a Double() argument or a comparison', () => {
    // The reason this is applied at the map emit rather than at the literal
    // emit reading the ambient expected type: that type describes an ENCLOSING
    // position and leaks into Int contexts. The broad version was written and
    // the chart engine's drift lock caught it emitting `slope[0.0]`,
    // `Double(n - 1.0)` and `level == 2.0` — none of which compile.
    const src = app(`const XS: Double[] = [1.5, 2.5]
const N: number = 2
function pick(): Double { return XS[N - 1] }
function tag(level: number): Double { return level == 2 ? XS[0] : XS[1] }`)
    for (const target of ['swift', 'kotlin'] as const) {
      const code = transform(src, { target }).code
      expect(code, `${target} index`).not.toMatch(/\[\s*N - 1\.0\s*\]/)
      expect(code, `${target} comparison`).not.toContain('level == 2.0')
      expect(code, `${target} index literal`).not.toMatch(/XS\[0\.0\]/)
    }
  })

  it.skipIf(!isKotlincAvailable())('the emitted Kotlin TYPECHECKS — the failure that found this', () => {
    const v = validateKotlin(transform(MAP, { target: 'kotlin' }).code)
    expect(v.ok, v.error ?? '').toBe(true)
  })

  it.skipIf(!isSwiftcAvailable())('and the Swift', () => {
    const v = validateSwiftWithStubs(transform(MAP, { target: 'swift' }).code)
    expect(v.ok, v.error ?? '').toBe(true)
  })
})
