// Zero-silent-drops (P1) — TS type-operator expressions (`as` / `satisfies` /
// `!`) in expression position, and the typed-empty-array they enable.
//
// `parseExpr` had NO case for `TSAsExpression` (`x as T`), `TSTypeAssertion`,
// `TSSatisfiesExpression`, or `TSNonNullExpression`, so they hit `default` →
// `unsupportedExpr` → a `{ kind: 'literal', value: '' }` fallback = the string
// `""`. So `[] as number[]` (the idiomatic typed-empty seed for a `.reduce`
// with an array accumulator) mis-emitted as `""` — Swift then failed loudly
// (`cannot convert 'Int' to 'String.Element'`) and Kotlin FALSE-PASSED
// (`"" + listOf(x)` coerces to a String, and `String.length` exists, so it
// compiled but produced garbage).
//
// Fix: parse the TS type-operators by UNWRAPPING to the inner expression. A
// bare `[]` carries no element type (→ `Any` / `List<Nothing>`), but the cast
// `[] as T[]` DOES name it — so the array IR gains an `elementType` that the
// emitters lower to a typed-empty literal (`[Int]()` / `emptyList<Int>()`) and
// the inference mirrors as `[T]`.
//
// Bisect-load-bearing: neuter the `TSAsExpression` parse case back to the
// original `{ kind: 'literal', value: '' }` fallback → the typed-empty +
// reduce specs fail (emit `""`); the non-empty `as`-cast unwrap control fails
// too (it also relied on the case). No pre-existing test codified `""`.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import {
  isKotlincAvailable,
  isSwiftUIAvailable,
  validateKotlin,
  validateSwiftTypecheck,
} from '../validate'

const sw = (src: string) => transform(src, { target: 'swift' }).code
const kt = (src: string) => transform(src, { target: 'kotlin' }).code

const arrReduce = `import { signal, computed } from '@pyreon/reactivity'
import { Stack, Text } from '@pyreon/primitives'
export function App(){
  const nums = signal<number[]>([1, 2, 3])
  const out = computed(() => nums().reduce((a: number[], b: number) => [...a, b * 2], [] as number[]))
  return (<Stack><Text>{String(out().length)}</Text></Stack>)
}`

// Returned DIRECTLY so the annotation IS the array type.
const emptyCast = `import { signal, computed } from '@pyreon/reactivity'
import { Stack, Text } from '@pyreon/primitives'
export function App(){
  const n = signal<number>(1)
  const out = computed(() => [] as number[])
  return (<Stack><Text>{String(out().length)}</Text></Stack>)
}`

// Regression — a NON-empty `as`-cast unwraps to the inner array (no `elementType`).
const nonEmptyCast = `import { signal, computed } from '@pyreon/reactivity'
import { Stack, Text } from '@pyreon/primitives'
export function App(){
  const nums = signal<number[]>([1, 2, 3])
  const out = computed(() => ([1, 2, 3] as number[]).length)
  return (<Stack><Text>{String(out())}</Text></Stack>)
}`

describe('P1 — TS `as` cast + typed-empty-array seed', () => {
  it('Swift: `[] as number[]` reduce seed → `[Int]()` (not `""`)', () => {
    expect(sw(arrReduce)).toContain('reduce([Int](),')
    expect(sw(arrReduce)).not.toContain('reduce("",')
  })
  it('Kotlin: `[] as number[]` reduce seed → `emptyList<Int>()` (not `""`)', () => {
    expect(kt(arrReduce)).toContain('emptyList<Int>()')
    expect(kt(arrReduce)).not.toContain('fold("",')
  })
  it('Swift: `computed(() => [] as number[])` infers `[Int]` and emits `[Int]()`', () => {
    expect(sw(emptyCast)).toContain('var out: [Int] {')
    expect(sw(emptyCast)).toContain('[Int]()')
  })
  it('Swift/Kotlin: a non-empty `as`-cast unwraps to the inner array (regression)', () => {
    expect(sw(nonEmptyCast)).toContain('([1, 2, 3]).count')
    expect(sw(nonEmptyCast)).not.toContain('""')
    expect(kt(nonEmptyCast)).not.toContain('""')
  })

  const proof = `import { signal, computed } from '@pyreon/reactivity'
import { Stack, Text } from '@pyreon/primitives'
export function App(){
  const nums = signal<number[]>([1, 2, 3])
  const doubled = computed(() => nums().reduce((a: number[], b: number) => [...a, b * 2], [] as number[]))
  const labels = computed(() => nums().reduce((a: string[], b: number) => [...a, String(b)], [] as string[]))
  const empty = computed(() => [] as number[])
  const out = computed(() => String(doubled().length) + " " + String(labels().length) + " " + String(empty().length))
  return (<Stack><Text>{out}</Text></Stack>)
}`

  it.skipIf(!isSwiftUIAvailable())('iOS: array-accumulator reduces + typed-empty TYPECHECK against real SwiftUI', () => {
    const r = validateSwiftTypecheck(sw(proof))
    expect(r.ok, r.error ?? '').toBe(true)
  })
  it.skipIf(!isKotlincAvailable())('Android: the same component compiles via kotlinc', () => {
    const r = validateKotlin(kt(proof))
    expect(r.ok, r.error ?? '').toBe(true)
  })
})
