// Zero-silent-drops (P1) — the NEGATIVE-index `.slice` COMBOS that #1938 left
// out. #1938 handled `slice(-m)` (last m) and `slice(0, -n)` (drop last n); the
// two-sided combos still emitted a raw `nums.slice(s, -n)` — INVALID on both
// targets (Swift "cannot call value of non-function type"; Kotlin "argument
// type mismatch: actual type is 'Int', but 'IntRange' was expected").
//
// The added lowerings (front op decided by the start arg, both drop from the
// end because the end is negative):
//   slice(s, -n)  (s a positive literal)  → Swift `dropFirst(s).dropLast(n)`  Kotlin `drop(s).dropLast(n)`
//   slice(-m, -n) (negative start)        → Swift `suffix(m).dropLast(n)`     Kotlin `takeLast(m).dropLast(n)`
// (`slice(0, -n)` still lowers to the leaner `dropLast(n)` — unchanged.)
//
// All are extensions of the ONE shared `classifyNegativeSlice` (infer-type.ts).
// A NON-literal non-negative start (a variable) with a negative end can't be
// proven front-anchored, so it stays a fall-through (a follow-up shape).
//
// Bisect-load-bearing: neuter `classifyNegativeSlice` to only keep the
// `slice(0, -n)` path (return null for a non-zero / negative start) → the combo
// emit specs + compile proofs fail; the `slice(0, -n)` / `slice(-m)` regression
// controls stay green.

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
  const nums = signal<number[]>([10, 20, 30, 40, 50])
${body}
  return (<Stack><Text>{out}</Text></Stack>)
}`

const sw = (src: string) => transform(src, { target: 'swift' }).code
const kt = (src: string) => transform(src, { target: 'kotlin' }).code

const posNeg = A(`  const out = computed(() => String(nums().slice(1, -1).length))`)
const posNeg2 = A(`  const out = computed(() => String(nums().slice(2, -1).length))`)
const negNeg = A(`  const out = computed(() => String(nums().slice(-3, -1).length))`)
// Regression controls — the #1938 forms must keep their leaner emit.
const dropLast = A(`  const out = computed(() => String(nums().slice(0, -1).length))`)
const last = A(`  const out = computed(() => String(nums().slice(-2).length))`)

describe('P1 — negative-index `.slice` COMBOS (completes #1938)', () => {
  it('Swift: `slice(1, -1)` → `dropFirst(1).dropLast(1)`', () => {
    expect(sw(posNeg)).toContain('dropFirst(1).dropLast(1)')
    expect(sw(posNeg)).not.toContain('.slice(')
  })
  it('Kotlin: `slice(1, -1)` → `drop(1).dropLast(1)`', () => {
    expect(kt(posNeg)).toContain('.drop(1).dropLast(1)')
    expect(kt(posNeg)).not.toContain('.slice(')
  })
  it('Swift: `slice(2, -1)` → `dropFirst(2).dropLast(1)`', () => {
    expect(sw(posNeg2)).toContain('dropFirst(2).dropLast(1)')
  })
  it('Swift: `slice(-3, -1)` → `suffix(3).dropLast(1)`', () => {
    expect(sw(negNeg)).toContain('suffix(3).dropLast(1)')
    expect(sw(negNeg)).not.toContain('.slice(')
  })
  it('Kotlin: `slice(-3, -1)` → `takeLast(3).dropLast(1)`', () => {
    expect(kt(negNeg)).toContain('.takeLast(3).dropLast(1)')
    expect(kt(negNeg)).not.toContain('.slice(')
  })

  // Regression — `slice(0, -1)` keeps the leaner `dropLast(1)` (NOT
  // `dropFirst(0).dropLast(1)`), and `slice(-2)` keeps `suffix`/`takeLast`.
  it('Swift/Kotlin: `slice(0, -1)` still lowers to the leaner `dropLast(1)`', () => {
    expect(sw(dropLast)).toContain('dropLast(1)')
    expect(sw(dropLast)).not.toContain('dropFirst(0)')
    expect(kt(dropLast)).toContain('.dropLast(1)')
  })
  it('Swift/Kotlin: `slice(-2)` still lowers to `suffix(2)` / `takeLast(2)`', () => {
    expect(sw(last)).toContain('suffix(2)')
    expect(kt(last)).toContain('.takeLast(2)')
  })

  // Compile proof — all combos in one component TYPECHECK against real SwiftUI /
  // kotlinc (the native ops clamp like JS, so no bounds guard is needed).
  const proof = A(`  const mid = computed(() => nums().slice(1, -1))
  const mid2 = computed(() => nums().slice(2, -1))
  const tail = computed(() => nums().slice(-3, -1))
  const out = computed(() => String(mid().length) + " " + String(mid2().length) + " " + String(tail().length))`)

  it.skipIf(!isSwiftUIAvailable())('iOS: all slice combos TYPECHECK against real SwiftUI', () => {
    const r = validateSwiftTypecheck(sw(proof))
    expect(r.ok, r.error ?? '').toBe(true)
  })
  it.skipIf(!isKotlincAvailable())('Android: the same component compiles via kotlinc', () => {
    const r = validateKotlin(kt(proof))
    expect(r.ok, r.error ?? '').toBe(true)
  })
})
