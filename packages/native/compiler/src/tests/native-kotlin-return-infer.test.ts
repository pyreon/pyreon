// Kotlin block-body function return-type inference (correctness widening).
//
// Kotlin does NOT infer return types for BLOCK bodies — only for concise
// `= expr` bodies. So a value-returning multi-statement helper
// (`function compute() { val x = …; return x * 2 }`) emitted without a
// `: T` clause is a kotlinc error (`Unit` expected, value found). The Swift
// side closed the equivalent gap in #1707 via `inferReturnType`; this wires
// the SAME shared inference into the Kotlin block-body emit path:
//
//   function double(n: number) { return n * 2 }  -> Kotlin  fun double(n: Int): Int { … }
//
// Concise bodies stay un-annotated (Kotlin infers them natively); void
// block bodies stay un-annotated (→ Unit); un-inferable returns fall back
// to no annotation (matching Swift's documented fallback).

import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import { isKotlincAvailable, validateKotlin } from '../validate'

const app = (body: string) =>
  `import { Stack, Text } from '@pyreon/primitives'
function App() {
  const n = signal<number>(2)
${body}
  return (<Stack><Text>x</Text></Stack>)
}`

describe('Kotlin block-body return-type inference', () => {
  it('a value-returning block body gets an inferred `: T` clause', () => {
    // Multi-statement block (a `val` + a `return`) can't use the concise
    // `= expr` form, so it needs an explicit return type.
    const out = transform(
      app(`  function compute(x: number) {
    const y = x + 1
    return y * 2
  }`),
      { target: 'kotlin' },
    ).code
    // Inferred Int from the `* 2` arithmetic on a number param.
    expect(out).toMatch(/fun compute\(x: Int\): Int \{/)
  })

  it('infers a Boolean return from a comparison body', () => {
    const out = transform(
      app(`  function isPositive(x: number) {
    const z = x
    return z > 0
  }`),
      { target: 'kotlin' },
    ).code
    expect(out).toMatch(/fun isPositive\(x: Int\): Boolean \{/)
  })

  it('a concise (= expr) body stays un-annotated — Kotlin infers it', () => {
    // Single-return body lowers to the concise form, which Kotlin
    // type-infers; we must NOT add a redundant `: T` (would diverge from
    // the existing concise-emit contract / snapshots).
    const out = transform(app(`  const triple = (x: number) => x * 3`), {
      target: 'kotlin',
    }).code
    expect(out).toMatch(/fun triple\(x: Int\) = /)
    expect(out).not.toMatch(/fun triple\(x: Int\):/)
  })

  it('a void block body stays un-annotated (→ Unit)', () => {
    const out = transform(
      app(`  function bump(x: number) {
    const y = x + 1
    n.set(y)
  }`),
      { target: 'kotlin' },
    ).code
    // No value `return` → no annotation (Kotlin defaults to Unit).
    expect(out).toMatch(/fun bump\(x: Int\) \{/)
    expect(out).not.toMatch(/fun bump\(x: Int\):/)
  })

  it.skipIf(!isKotlincAvailable())(
    'Kotlin: an inferred-return block-body helper typechecks via kotlinc',
    () => {
      const out = transform(
        app(`  function compute(x: number) {
    const y = x + 1
    return y * 2
  }
  const r = computed(() => compute(n()))`),
        { target: 'kotlin' },
      ).code
      const res = validateKotlin(out)
      expect(res.ok, res.error ?? '').toBe(true)
    },
  )
})
