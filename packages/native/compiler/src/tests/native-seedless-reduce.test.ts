// Zero-silent-drops (P1) — the SEEDLESS `.reduce(fn)` form on Swift.
//
// JS `arr.reduce(fn)` (no initial value) seeds the accumulator with the FIRST
// element and folds over the rest. Swift has no 1-arg reduce, so the bare
// `arr.reduce({ … })` bound to `reduce(into:)` → "missing argument for parameter
// 'into'". (Kotlin's `.reduce { acc, x -> … }` already matches JS 1-arg, so this
// is Swift-only.)
//
// Lowering: `obj.dropFirst().reduce(obj[0], fn)` — arr[0] is the seed, the rest
// is folded. This names `obj` TWICE, so it's only applied when the receiver is
// RE-READABLE (identifier / signal / store read, via `isReReadableExpr`); a
// receiver with a real method call (`filter(...)`) would re-run that work, so
// those emit a NAMED build-failing warning + defer. `obj[0]` traps on an empty
// array like JS's "Reduce of empty array with no initial value" throw.
//
// The seedless RESULT type is the array's ELEMENT type (JS seeds with arr[0]),
// fixed in the reduce inference — without it the max idiom
// `(a, b) => a > b ? a : b` degraded to `Any`.
//
// Bisect-load-bearing: (1) neuter the seedless emit → the seedless specs fall to
// the broken `reduce({…})` and fail; (2) neuter `isReReadableExpr` → true → the
// chained-receiver case emits the double-eval lowering instead of warning; (3)
// neuter the reduce inference's element-seed → the seedless-max type degrades.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import {
  isKotlincAvailable,
  isSwiftUIAvailable,
  validateKotlin,
  validateSwiftTypecheck,
} from '../validate'

const A = (body: string) =>
  `import { signal, computed } from '@pyreon/reactivity'\n` +
  `import { Stack, Text } from '@pyreon/primitives'\n` +
  `export function App(){
  const nums = signal<number[]>([10, 20, 30])
${body}
  return (<Stack><Text>{out}</Text></Stack>)
}`

const sw = (src: string) => transform(src, { target: 'swift' }).code
const kt = (src: string) => transform(src, { target: 'kotlin' }).code

// Returned DIRECTLY so the annotation IS the reduce result type.
const sum = A(`  const out = computed(() => nums().reduce((a: number, b: number) => a + b))`)
const max = A(`  const out = computed(() => nums().reduce((a: number, b: number) => (a > b ? a : b)))`)
const seeded = A(`  const out = computed(() => nums().reduce((a: number, b: number) => a + b, 0))`)
const chained = A(`  const out = computed(() => nums().filter((n: number) => n > 5).reduce((a: number, b: number) => a + b))`)

describe('P1 — seedless `.reduce(fn)` (Swift)', () => {
  it('Swift: `reduce(fn)` → `dropFirst().reduce(nums[0], fn)` (not bare `reduce({…})`)', () => {
    expect(sw(sum)).toContain('nums.dropFirst().reduce(nums[0], {')
  })
  it('Swift: seedless `max` idiom infers the element type `Int` (not `Any`)', () => {
    expect(sw(max)).toContain('var out: Int {')
    expect(sw(max)).not.toContain('var out: Any {')
  })
  it('Swift: seeded `reduce(fn, 0)` is unchanged (regression)', () => {
    expect(sw(seeded)).toContain('nums.reduce(0, {')
    expect(sw(seeded)).not.toContain('dropFirst()')
  })

  // Guard — a chained-method receiver can't be re-read, so it must WARN + keep
  // the raw emit (never the double-eval `filter(...).dropFirst().reduce(...)`).
  it('Swift: seedless reduce on a chained receiver warns + does NOT lower', () => {
    const rs = transform(chained, { target: 'swift' })
    expect(rs.warnings.some((w) => w.includes('seedless'))).toBe(true)
    expect(rs.code).not.toContain('dropFirst()')
  })

  it('Kotlin: seedless `reduce(fn)` keeps the native 1-arg `.reduce {…}` (regression)', () => {
    expect(kt(sum)).toContain('.reduce(')
    expect(kt(sum)).not.toContain('dropFirst')
  })

  // Compile proof — sum + max in one component TYPECHECK against real SwiftUI /
  // kotlinc.
  const proof = A(`  const total = computed(() => nums().reduce((a: number, b: number) => a + b))
  const biggest = computed(() => nums().reduce((a: number, b: number) => (a > b ? a : b)))
  const out = computed(() => String(total()) + " " + String(biggest()))`)

  it.skipIf(!isSwiftUIAvailable())('iOS: seedless sum + max TYPECHECK against real SwiftUI', () => {
    const r = validateSwiftTypecheck(sw(proof))
    expect(r.ok, r.error ?? '').toBe(true)
  })
  it.skipIf(!isKotlincAvailable())('Android: the same component compiles via kotlinc', () => {
    const r = validateKotlin(kt(proof))
    expect(r.ok, r.error ?? '').toBe(true)
  })
})
