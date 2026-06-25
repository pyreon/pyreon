// Local object destructuring + binding call results to a const — a pervasive
// real-component shape that previously SILENTLY DROPPED on native (the
// destructured/bound local became an unbound reference, breaking the whole
// component; swiftc fails, `-parse` misses it). Three connected fixes:
//
//  1. `const foo = <call>` (signal/computed READ, method-chain, helper call)
//     bound to a const — was dropped (only non-CallExpression inits became
//     value-consts). Now falls back to a value-const, so the binding emits
//     and `foo.x` reads it. (Out-of-set `rx.<method>()` is excluded — it
//     keeps its deliberate warn-drop since `rx` is no native symbol.)
//  2. Component-level `const { x, y } = <expr>` — lowered (in
//     tryDeclFromVarDeclarator) to a synthetic container `__pyDestrN` + a
//     per-key field alias (parseExpr Identifier case), recursing into #1.
//  3. Body-local `const { x, y } = <expr>` inside a computed/function body —
//     expanded (in parseStatementBlock) to block-scoped `let`s: a container
//     `let __pyDestrN = <expr>` + one `let <local> = __pyDestrN.<key>` per
//     key (NOT the component-level alias map, which would leak across sibling
//     computeds).
//
// Rest/nested patterns bail (allSimple guard) → unchanged warn-drop, never
// half-bound. The object's field must resolve to a known struct for `.field`
// to typecheck (anonymous-object types are the separate struct-synthesis gap).

import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import {
  isSwiftcAvailable,
  isKotlincAvailable,
  isSwiftUIAvailable,
  validateSwift,
  validateSwiftTypecheck,
  validateKotlin,
} from '../validate'

// One component exercising ALL four shapes — kept as a SINGLE source so the
// compile gates run ONE swiftc/kotlinc invocation (looping 4 shapes × cold
// kotlinc blew the 60s test timeout under full-suite parallel load).
const ALL = `import { Stack, Text } from '@pyreon/primitives'
type Rec = { x: number; y: number }
function App() {
  const o = signal<Rec>({ x: 1, y: 2 })
  const ids = signal<number[]>([1, 2, 3])
  const foo = o()                                   // const bound to a signal read
  const { x, y } = o()                              // component-level destructure
  const d = computed(() => {                        // body-local destructure (+ rename)
    const { x: a, y: b } = o()
    return a * b
  })
  const evens = ids().filter((n) => n % 2 === 0)    // const bound to a method-chain
  return (<Stack><Text>{String(foo.x + x + y + d() + evens.length)}</Text></Stack>)
}`

describe('local object destructure + const-bound call results', () => {
  it('Swift: bindings emit (not dropped) — container + field reads', () => {
    const out = transform(ALL, { target: 'swift' }).code
    expect(out).toContain('foo')
    expect(out).toContain('evens')
    expect(out).toContain('__pyDestr') // synthetic destructure container(s)
    expect(out).toMatch(/__pyDestr\d+\.(x|y)/) // keys read off the container
  })

  it('Kotlin: bindings emit (not dropped)', () => {
    const out = transform(ALL, { target: 'kotlin' }).code
    expect(out).toContain('foo')
    expect(out).toContain('evens')
    expect(out).toContain('__pyDestr')
  })

  it('out-of-set rx.<method>() keeps its warn-drop (not turned into a value-const)', () => {
    const rxSrc = `import { Stack, Text } from '@pyreon/primitives'
import { rx } from '@pyreon/rx'
function App() {
  const items = signal<number[]>([1, 2, 3])
  const r = rx.intersperse(items, 0)
  return (<Stack><Text>x</Text></Stack>)
}`
    const out = transform(rxSrc, { target: 'swift' }).code
    expect(out).not.toMatch(/\b(var|let) r\b/) // no binding emitted (rx isn't native)
  })

  it.skipIf(!isSwiftcAvailable())('parses via swiftc', () => {
    const r = validateSwift(transform(ALL, { target: 'swift' }).code)
    expect(r.ok, r.error ?? '').toBe(true)
  })

  // Bisect-load-bearing: before the fix every binding silently dropped → an
  // unbound reference → swiftc TYPE error (`-parse` misses it).
  it.skipIf(!isSwiftUIAvailable())('TYPECHECKS against real SwiftUI', () => {
    const r = validateSwiftTypecheck(transform(ALL, { target: 'swift' }).code)
    expect(r.ok, r.error ?? '').toBe(true)
  })

  it.skipIf(!isKotlincAvailable())('compiles via kotlinc', () => {
    const r = validateKotlin(transform(ALL, { target: 'kotlin' }).code)
    expect(r.ok, r.error ?? '').toBe(true)
  })
})
