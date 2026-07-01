// Zero-silent-drops (P1) — empty-array-literal branch unification in ternary
// type inference.
//
// `cond ? [x] : []` (the conditional filter-map idiom — especially as a
// `.flatMap` body) and the mirrored `cond ? [] : [x]`: a bare `[]` carries no
// element type so it inferred `unknown`, and the ternary's branch-kind
// equality check degraded the whole expression (and the computed's Swift
// annotation) to `Any` — `String(out().length)` then failed ("value of type
// 'Any' has no member 'count'"). The VALUE is statically an empty array and
// JS types `cond ? T[] : []` as `T[]`, so the ternary inference now unifies
// to the array branch's type when the OTHER branch's EXPR is an untyped
// empty array LITERAL (never on a mere `unknown` type, which could be
// anything). Both emits already compiled under the unified annotation
// (compile-verified in the scratchpad before wiring: Swift types `[]`
// bidirectionally from context; Kotlin's `listOf()` is `List<Nothing>`, a
// subtype) — the fix is inference-only.
//
// Bisect-load-bearing: neuter the unification block → the array-ternary
// specs degrade back to `Any` while the same-kind + mixed-type controls
// still pass.

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

describe('P1 — ternary empty-array branch unification', () => {
  it('Swift: `cond ? [1, 2] : []` infers [Int], not Any', () => {
    const code = sw(A(`  const out = computed(() => nums().length > 1 ? [1, 2] : [])`))
    expect(code).toContain('var out: [Int] {')
    expect(code).not.toContain('var out: Any {')
  })
  it('Swift: the mirrored `cond ? [] : [9]` unifies too', () => {
    expect(sw(A(`  const out = computed(() => nums().length > 1 ? [] : [9])`))).toContain(
      'var out: [Int] {',
    )
  })
  it('Swift: the flatMap filter-map idiom `x > 1 ? [x] : []` types [Int]', () => {
    const code = sw(A(`  const out = computed(() => nums().flatMap((x: number) => x > 1 ? [x] : []))`))
    expect(code).toContain('var out: [Int] {')
    expect(code).toContain('flatMap({ x in x > 1 ? [x] : [] })')
  })
  it('Swift: a string-array branch unifies to [String]', () => {
    expect(sw(A(`  const out = computed(() => nums().length > 1 ? ["a"] : [])`))).toContain(
      'var out: [String] {',
    )
  })

  // Controls — the unification is scoped to empty-array LITERAL branches.
  it('control: same-kind branches unchanged; mixed scalar branches stay Any', () => {
    expect(sw(A(`  const out = computed(() => nums().length > 1 ? 1 : 2)`, 'String(out())'))).toContain(
      'var out: Int {',
    )
    expect(sw(A(`  const out = computed(() => nums().length > 1 ? 1 : "x")`, 'out()'))).toContain(
      'var out: Any {',
    )
  })
  it('control: a TYPED empty branch (`[] as number[]`) keeps its own path', () => {
    const code = sw(A(`  const out = computed(() => nums().length > 1 ? [1] : [] as number[])`))
    expect(code).toContain('var out: [Int] {')
    expect(code).toContain('[Int]()')
  })

  // Compile proof — the idiom end-to-end through real swiftc + kotlinc.
  const proof = `import { signal, computed } from '@pyreon/reactivity'
import { Stack, Text } from '@pyreon/primitives'
export function App(){
  const nums = signal<number[]>([1, 2, 3])
  const picked = computed(() => nums().flatMap((x: number) => x > 1 ? [x] : []))
  const headed = computed(() => nums().length > 1 ? [1, 2] : [])
  const out = computed(() => picked().length + headed().length)
  return (<Stack><Text>{String(out())}</Text></Stack>)
}`
  it.skipIf(!isSwiftUIAvailable())('iOS: the filter-map component TYPECHECKS against real SwiftUI', () => {
    const r = validateSwiftTypecheck(sw(proof))
    expect(r.ok, r.error ?? '').toBe(true)
  })
  it.skipIf(!isKotlincAvailable())('Android: the same component compiles via kotlinc', () => {
    const r = validateKotlin(kt(proof))
    expect(r.ok, r.error ?? '').toBe(true)
  })
})
