// Zero-silent-drops (P1) — object-literal → DECLARED-struct result-type inference.
//
// `inferType`'s `object` case degraded EVERY object literal to `unknown`, so a
// computed returning one — or a `.reduce` with an OBJECT accumulator — typed
// `Any` on Swift and a downstream field read failed ("value of type 'Any' has
// no member 'sum'"). The EMIT already resolved the literal to its declared
// struct (`nums.reduce(Acc(sum: 0, count: 0), …)`) via `_structFieldsToName`;
// only the inference lagged.
//
// The fix mirrors that emit lookup: match the literal's sorted field-set against
// the declared structs (`ctx.structs`, first-wins) → a `typeRef` to the struct.
// So `reduce((a: Acc, b) => ({sum: a.sum+b, count: a.count+1}), {sum:0,count:0})`
// types `Acc`, and a plain `computed(() => ({x, y}))` over a declared `Point`
// types `Point`. A literal matching NO declared struct stays `unknown` (the emit
// synthesizes an anonymous `__ObjN` for it, but inference can't name that
// without the emitter's per-run registry — a separate follow-up).
//
// Bisect-load-bearing: neuter the `object` case back to `return { kind:
// 'unknown' }` → the declared-struct annotations + compile proofs fail; the
// scalar-seed `reduce` regression controls stay green.

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

// `out` RETURNS the reduce/literal directly so its annotation IS the result
// type (the struct when inference works, `Any` when it degrades).
const objReduce = `import { signal, computed } from '@pyreon/reactivity'
import { Stack, Text } from '@pyreon/primitives'
type Acc = { sum: number; count: number }
export function App(){
  const nums = signal<number[]>([10, 20, 30])
  const out = computed(() => nums().reduce((a: Acc, b: number) => ({ sum: a.sum + b, count: a.count + 1 }), { sum: 0, count: 0 }))
  return (<Stack><Text>{String(out().sum)}</Text></Stack>)
}`

const objComputed = `import { signal, computed } from '@pyreon/reactivity'
import { Stack, Text } from '@pyreon/primitives'
type Point = { x: number; y: number }
export function App(){
  const n = signal<number>(5)
  const out = computed(() => ({ x: n(), y: n() * 2 }))
  return (<Stack><Text>{String(out().x)}</Text></Stack>)
}`

const A = (body: string) =>
  `import { signal, computed } from '@pyreon/reactivity'\n` +
  `import { Stack, Text } from '@pyreon/primitives'\n` +
  `export function App(){
  const nums = signal<number[]>([10, 20, 30])
${body}
  return (<Stack><Text>{out}</Text></Stack>)
}`
const numReduce = A(`  const out = computed(() => nums().reduce((a: number, b: number) => a + b, 0))`)
const strReduce = A(`  const out = computed(() => nums().reduce((a: string, b: number) => a + String(b), ""))`)

describe('P1 — object-literal → declared-struct result-type inference', () => {
  it('Swift: `.reduce` with an OBJECT accumulator infers the struct (not `Any`)', () => {
    expect(sw(objReduce)).toContain('var out: Acc {')
    expect(sw(objReduce)).not.toContain('var out: Any {')
  })
  it('Swift: a computed RETURNING a declared-struct literal infers the struct', () => {
    expect(sw(objComputed)).toContain('var out: Point {')
    expect(sw(objComputed)).not.toContain('var out: Any {')
  })

  // Regression — scalar-seed reduces keep their inferred scalar type.
  it('Swift: numeric/string `.reduce` still infer `Int` / `String` (regression)', () => {
    expect(sw(numReduce)).toContain('var out: Int {')
    expect(sw(strReduce)).toContain('var out: String {')
  })

  it.skipIf(!isSwiftUIAvailable())('iOS: object-accumulator reduce + struct-literal computed TYPECHECK against real SwiftUI', () => {
    const r1 = validateSwiftTypecheck(sw(objReduce))
    expect(r1.ok, r1.error ?? '').toBe(true)
    const r2 = validateSwiftTypecheck(sw(objComputed))
    expect(r2.ok, r2.error ?? '').toBe(true)
  })
  it.skipIf(!isKotlincAvailable())('Android: the same components compile via kotlinc', () => {
    const r1 = validateKotlin(kt(objReduce))
    expect(r1.ok, r1.error ?? '').toBe(true)
    const r2 = validateKotlin(kt(objComputed))
    expect(r2.ok, r2.error ?? '').toBe(true)
  })
})
