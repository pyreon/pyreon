// Zero-silent-drops (P1) — `.flatMap` result-type inference + the array-literal
// homogeneity bug it surfaced.
//
// `.flatMap` already EMITTED natively (`arr.flatMap({ … })` — both Swift and
// Kotlin have it), but `inferType` had no `flatMap` case, so the computed typed
// `Any` on Swift and a chained `.length` / typed use failed ("value of type
// 'Any' has no member 'count'"). Kotlin infers on its own, so this was
// Swift-only.
//
// Two coordinated fixes:
//   • `flatMap` inference — `arr.flatMap(x => [E])` flattens one level → `[E]`
//     (the callback's ARRAY body type itself, unlike `.map(x => [E]) → [[E]]`).
//   • the binary-arithmetic float convention — `n * 2` returned
//     `{ kind: 'number', float: false }` while a bare `n` returned
//     `{ kind: 'number' }`, so the array-literal homogeneity check
//     (`JSON.stringify` equality) treated `[n, n * 2]` as heterogeneous →
//     `unknown` → the flatMap element degraded to `Any`. Fixed to follow the
//     "float ONLY when true" convention so a non-float result is byte-identical
//     to `{ kind: 'number' }`. This ALSO fixes any array literal mixing a bare
//     value and an arithmetic expression (`[a, a * 2]`).
//
// Bisect-load-bearing: (1) neuter the `flatMap` case → the flatMap specs type
// `Any` and fail; (2) restore the `float: false` binary shape → `[n, n * 2]`
// homogeneity breaks and the flatMap-of-arithmetic + array-literal specs fail.
// (The `String()`-body flatMap and `Int * Double` cases are separate
// pre-existing gaps, deliberately not covered here.)

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

const A = (body: string) =>
  `import { signal, computed } from '@pyreon/reactivity'\n` +
  `import { Stack, Text } from '@pyreon/primitives'\n` +
  `export function App(){
  const nums = signal<number[]>([1, 2, 3])
${body}
  return (<Stack><Text>{String(out().length)}</Text></Stack>)
}`
// Returned DIRECTLY so the annotation IS the flatMap/array result type.
const flatNum = A(`  const out = computed(() => nums().flatMap((n: number) => [n, n * 2]))`)
const arrLit = A(`  const out = computed(() => [nums()[0], nums()[0] * 2])`)
const mapReg = A(`  const out = computed(() => nums().map((n: number) => n + 1))`)

const flatObj = `import { signal, computed } from '@pyreon/reactivity'
import { Stack, Text } from '@pyreon/primitives'
type Tag = { id: number }
export function App(){
  const rows = signal<Tag[]>([{ id: 1 }])
  const out = computed(() => rows().flatMap((r: Tag) => [r.id, r.id + 1]))
  return (<Stack><Text>{String(out().length)}</Text></Stack>)
}`

describe('P1 — `.flatMap` inference + array-literal homogeneity', () => {
  it('Swift: `flatMap(n => [n, n*2])` infers `[Int]` (not `Any`)', () => {
    expect(sw(flatNum)).toContain('var out: [Int] {')
    expect(sw(flatNum)).not.toContain('var out: Any {')
    // The emit is the generic native flatMap (unchanged).
    expect(sw(flatNum)).toContain('nums.flatMap(')
  })
  it('Swift: `flatMap` over an object array infers `[Int]`', () => {
    expect(sw(flatObj)).toContain('var out: [Int] {')
  })
  it('Swift: an array literal mixing a value + arithmetic `[a, a*2]` infers `[Int]`', () => {
    expect(sw(arrLit)).toContain('var out: [Int] {')
    expect(sw(arrLit)).not.toContain('var out: Any {')
  })
  it('Swift: `.map(n => n+1)` still infers `[Int]` (regression)', () => {
    expect(sw(mapReg)).toContain('var out: [Int] {')
  })

  const proof = `import { signal, computed } from '@pyreon/reactivity'
import { Stack, Text } from '@pyreon/primitives'
type Tag = { id: number }
export function App(){
  const nums = signal<number[]>([1, 2, 3])
  const rows = signal<Tag[]>([{ id: 1 }])
  const pairs = computed(() => nums().flatMap((n: number) => [n, n * 2]))
  const ids = computed(() => rows().flatMap((r: Tag) => [r.id, r.id + 1]))
  const out = computed(() => String(pairs().length) + " " + String(ids().length))
  return (<Stack><Text>{out}</Text></Stack>)
}`

  it.skipIf(!isSwiftUIAvailable())('iOS: flatMap (numeric + object) TYPECHECK against real SwiftUI', () => {
    const r = validateSwiftTypecheck(sw(proof))
    expect(r.ok, r.error ?? '').toBe(true)
  })
  it.skipIf(!isKotlincAvailable())('Android: the same component compiles via kotlinc', () => {
    const r = validateKotlin(kt(proof))
    expect(r.ok, r.error ?? '').toBe(true)
  })
})
