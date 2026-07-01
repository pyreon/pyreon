// Zero-silent-drops (P1) — Int×Double coercion inside an element-callback
// closure body on Swift.
//
// Swift has NO implicit Int→Double conversion, so `count() * 0.5` (an Int
// signal × a fractional literal) needs `Double(count()) * 0.5`. The emit
// already coerced a COMPONENT-scope operand (`n * 1.5` → `Double(n) * 1.5`,
// via `numericFloatness` reading the active inference ctx). But an
// element-callback PARAM (`nums().map(x => x * 1.5)`) is neither a signal nor
// a const, so inside the closure it inferred `unknown` → `numericFloatness`
// returned `'other'` → the coercion branch never fired → bare `x * 1.5` →
// "cannot convert value of type 'Int' to expected argument type 'Double'".
//
// Fix: `emitSwiftMemberCallArgs` binds an element-callback's first arrow param
// to the receiver's element type in `_activeInferCtx.locals` while emitting the
// args, so the closure body sees `x: Int` and coerces (`Double(x) * 1.5`). The
// generic member fall-through reuses that SAME scoped `argExprs` (no double
// emit / double warning). Restored via try/finally, so nested/sibling closures
// each see their own element type. (Kotlin auto-promotes Int×Double, so it is
// UNCHANGED — a Swift-only fix.)
//
// Bisect-load-bearing: (1) neuter `emitSwiftMemberCallArgs`'s scope → the
// map/filter/forEach coercion specs fall to bare `x * 1.5` and FAIL; (2) neuter
// the generic member fall-through's scoped `argExprs` → the `.map`/`.forEach`
// specs (which fall through) fail while `.filter` (a specific rewrite using
// `argExprs`) still passes.

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
  const nums = signal<number[]>([1, 2, 3])
${body}
  return (<Stack><Text>{String(out().length)}</Text></Stack>)
}`

const sw = (src: string) => transform(src, { target: 'swift' }).code
const kt = (src: string) => transform(src, { target: 'kotlin' }).code

const mapMul = A(`  const out = computed(() => nums().map((x: number) => x * 1.5))`)
const mapSub = A(`  const out = computed(() => nums().map((x: number) => x - 0.5))`)
const mapAdd = A(`  const out = computed(() => nums().map((x: number) => x + 0.5))`)
const filterFloat = A(`  const out = computed(() => nums().filter((x: number) => x * 1.5 > 2))`)
const mapInt = A(`  const out = computed(() => nums().map((x: number) => x * 2))`)

describe('P1 — Int×Double coercion in an element-callback body (Swift)', () => {
  it('Swift: `.map(x => x * 1.5)` coerces the Int param → `Double(x) * 1.5`', () => {
    expect(sw(mapMul)).toContain('nums.map({ x in Double(x) * 1.5 })')
    expect(sw(mapMul)).not.toContain('{ x in x * 1.5 }')
    // return type is still inferred [Double]
    expect(sw(mapMul)).toContain('var out: [Double] {')
  })
  it('Swift: `-` and `+` coerce too (the param is now KNOWN Int, no concat ambiguity)', () => {
    expect(sw(mapSub)).toContain('nums.map({ x in Double(x) - 0.5 })')
    expect(sw(mapAdd)).toContain('nums.map({ x in Double(x) + 0.5 })')
  })
  it('Swift: a filter PREDICATE with float arithmetic coerces its Int param', () => {
    expect(sw(filterFloat)).toContain('nums.filter({ x in Double(x) * 1.5 > 2 })')
  })

  // Control — a pure Int×Int body must stay BARE (no spurious Double wrap).
  it('Swift: `.map(x => x * 2)` (Int×Int) stays bare `x * 2` (no coercion)', () => {
    expect(sw(mapInt)).toContain('nums.map({ x in x * 2 })')
    expect(sw(mapInt)).not.toContain('Double(x)')
    expect(sw(mapInt)).toContain('var out: [Int] {')
  })

  // Kotlin is UNCHANGED — it auto-promotes Int×Double, so the param must NOT be
  // wrapped in a Double conversion (that would be non-idiomatic + redundant).
  it('Kotlin: `.map(x => x * 1.5)` keeps the native bare body (regression)', () => {
    expect(kt(mapMul)).toContain('x * 1.5')
    expect(kt(mapMul)).not.toContain('Double(x)')
  })

  // Nested / sibling closures each see their OWN element type (try/finally
  // restore). Struct-field access in a callback body is unaffected.
  it('Swift: struct-field callback body is unaffected (regression)', () => {
    const structMap = `import { signal, computed } from '@pyreon/reactivity'
import { Stack, Text } from '@pyreon/primitives'
type Todo = { id: number; label: string }
export function App(){
  const todos = signal<Todo[]>([{ id: 1, label: 'a' }])
  const out = computed(() => todos().map((t: Todo) => t.id))
  return (<Stack><Text>{String(out().length)}</Text></Stack>)
}`
    expect(sw(structMap)).toContain('todos.map({ t in t.id })')
    expect(sw(structMap)).toContain('var out: [Int] {')
  })

  // Compile proof — a component mixing all three coercing ops + an Int control
  // TYPECHECKS against real SwiftUI / kotlinc.
  const proof = `import { signal, computed } from '@pyreon/reactivity'
import { Stack, Text } from '@pyreon/primitives'
export function App(){
  const nums = signal<number[]>([1, 2, 3])
  const scaled = computed(() => nums().map((x: number) => x * 1.5))
  const shifted = computed(() => nums().map((x: number) => x - 0.5))
  const doubled = computed(() => nums().map((x: number) => x * 2))
  const out = computed(() => scaled().length + shifted().length + doubled().length)
  return (<Stack><Text>{String(out())}</Text></Stack>)
}`

  it.skipIf(!isSwiftUIAvailable())('iOS: the coercing map component TYPECHECKS against real SwiftUI', () => {
    const r = validateSwiftTypecheck(sw(proof))
    expect(r.ok, r.error ?? '').toBe(true)
  })
  it.skipIf(!isKotlincAvailable())('Android: the same component compiles via kotlinc', () => {
    const r = validateKotlin(kt(proof))
    expect(r.ok, r.error ?? '').toBe(true)
  })
})
