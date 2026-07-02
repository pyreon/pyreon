// Zero-silent-drops (P1) — Int×Double coercion inside 2-PARAM index-callback
// bodies + mixed Int×Double COMPARISON coercion (Swift).
//
// Completes the family #1972 began: the 1-param element-callback scoping
// (`emitSwiftMemberCallArgs`) does not cover the 2-param `(el, idx)` form,
// which lowers through the SEPARATE `enumerated()` path
// (`emitSwiftIndexedClosure`) — so `nums().map((x, i) => x * 1.5)` emitted
// the bare `x * 1.5` ("cannot convert value of type 'Int' to expected
// argument type 'Double'"). The closure emit now binds the element param to
// the receiver's element type and the index param to Int (enumerated()'s
// offset), restored via try/finally.
//
// Fixing that EXPOSED the sibling gap (the recurring root-cause pattern):
// Swift also requires same-type operands for COMPARISONS — `x * 1.5 > i`
// coerced the arithmetic but then failed at `Double > Int` ("referencing
// operator function '>' on 'BinaryInteger' requires…"). The `comparison`
// emit now coerces the Int side when EXACTLY one operand is Double —
// mirroring the arithmetic `binary` case. `numericFloatness` returns
// 'other' for non-numbers, so enum/string/bool comparisons are untouched.
//
// Bisect-load-bearing pieces: (1) neuter the indexed-closure param binding →
// the 2-param coercion specs fall to bare `x * 1.5`; (2) neuter the
// comparison coercion → the predicate specs fail at `Double > Int` while
// the arithmetic-only map spec still passes.

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

const A = (body: string, read = 'String(out().length)') =>
  `import { signal, computed } from '@pyreon/reactivity'\n` +
  `import { Stack, Text } from '@pyreon/primitives'\n` +
  `export function App(){
  const nums = signal<number[]>([1, 2, 3])
${body}
  return (<Stack><Text>{${read}}</Text></Stack>)
}`

describe('P1 — 2-param index-callback Int×Double + mixed comparisons (Swift)', () => {
  it('Swift: `.map((x, i) => x * 1.5)` coerces via the enumerated path', () => {
    const code = sw(A(`  const out = computed(() => nums().map((x: number, i: number) => x * 1.5))`))
    expect(code).toContain('enumerated().map({ (i, x) in Double(x) * 1.5 })')
    expect(code).toContain('var out: [Double] {')
  })
  it('Swift: struct element type flows into the 2-param body (`t.qty * 1.5`)', () => {
    const code = sw(`import { signal, computed } from '@pyreon/reactivity'
import { Stack, Text } from '@pyreon/primitives'
type T = { id: number; qty: number }
export function App(){
  const items = signal<T[]>([{ id: 1, qty: 2 }])
  const out = computed(() => items().map((t: T, i: number) => t.qty * 1.5))
  return (<Stack><Text>{String(out().length)}</Text></Stack>)
}`)
    expect(code).toContain('{ (i, t) in Double(t.qty) * 1.5 }')
  })

  it('Swift: a mixed comparison coerces the Int side (`x * 1.5 > i` → `> Double(i)`)', () => {
    const code = sw(A(`  const out = computed(() => nums().filter((x: number, i: number) => x * 1.5 > i))`))
    expect(code).toContain('Double(x) * 1.5 > Double(i)')
  })
  it('Swift: `Double-signal > Int-signal` coerces at component scope too', () => {
    const code = sw(`import { signal, computed } from '@pyreon/reactivity'
import { Stack, Text } from '@pyreon/primitives'
export function App(){
  const d = signal<number>(1.5)
  const n = signal<number>(1)
  const out = computed(() => d() > n())
  return (<Stack><Text>{String(out())}</Text></Stack>)
}`)
    expect(code).toContain('var out: Bool { d > Double(n) }')
  })

  // Controls — non-mixed comparisons stay bare (no spurious Double()).
  it('controls: Int==Int / Int>lit / string / enum comparisons untouched', () => {
    expect(sw(A(`  const out = computed(() => nums().filter((x: number) => x === 2))`))).toContain(
      '{ x in x == 2 }',
    )
    expect(sw(A(`  const out = computed(() => nums().filter((x: number) => x > 1))`))).toContain(
      '{ x in x > 1 }',
    )
    const enumCmp = sw(`import { signal, computed } from '@pyreon/reactivity'
import { Stack, Text } from '@pyreon/primitives'
type Filter = 'all' | 'done'
export function App(){
  const f = signal<Filter>('all')
  const out = computed(() => f() === 'all' ? 1 : 2)
  return (<Stack><Text>{String(out())}</Text></Stack>)
}`)
    expect(enumCmp).toContain('f == .all ? 1 : 2')
    expect(enumCmp).not.toContain('Double(')
  })
  it('control: `(x, i) => x + i` (Int×Int) stays bare through the enumerated path', () => {
    const code = sw(A(`  const out = computed(() => nums().map((x: number, i: number) => x + i))`))
    expect(code).toContain('{ (i, x) in x + i }')
    expect(code).not.toContain('Double(')
  })
  it('Kotlin: 2-param float body keeps the native bare emit (auto-promotes)', () => {
    const code = kt(A(`  const out = computed(() => nums().map((x: number, i: number) => x * 1.5))`))
    expect(code).toContain('mapIndexed')
    expect(code).not.toContain('Double(')
  })

  // Compile proof — the coercing shapes in one component, real swiftc + kotlinc.
  const proof = `import { signal, computed } from '@pyreon/reactivity'
import { Stack, Text } from '@pyreon/primitives'
export function App(){
  const nums = signal<number[]>([1, 2, 3])
  const scaled = computed(() => nums().map((x: number, i: number) => x * 1.5))
  const picked = computed(() => nums().filter((x: number, i: number) => x * 1.5 > i))
  const idx = computed(() => nums().findIndex((x: number, i: number) => x - 0.5 > i))
  const out = computed(() => scaled().length + picked().length + idx())
  return (<Stack><Text>{String(out())}</Text></Stack>)
}`
  it.skipIf(!isSwiftUIAvailable())('iOS: the 2-param coercing component TYPECHECKS against real SwiftUI', () => {
    const r = validateSwiftTypecheck(sw(proof))
    expect(r.ok, r.error ?? '').toBe(true)
  })
  it.skipIf(!isKotlincAvailable())('Android: the same component compiles via kotlinc', () => {
    const r = validateKotlin(kt(proof))
    expect(r.ok, r.error ?? '').toBe(true)
  })
})
