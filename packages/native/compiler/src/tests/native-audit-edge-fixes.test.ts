// Five edge cracks in the "closed" declarative subset, surfaced by a broad
// audit probe and fixed together. Each was a SILENT swiftc/kotlinc failure
// (the per-PR `-parse`/stub gate misses type-level errors), not caught by the
// curated fixtures because the probe exercised wider shapes than they did.
//
//   BUG-1  Double-domain `Math.*` (sqrt/floor/ceil/round/pow) on an Int arg
//          emitted the bare `sqrt(n)` — Swift has no implicit Int→Double, so
//          "cannot convert 'Int' to 'Double'". Now coerced `sqrt(Double(n))`.
//          (`abs`/`min`/`max` stay generic — must NOT coerce, would force a
//          Double result.)
//   UNARY  `signal(-5)` / `signal(-9.5)` parsed as a `unary` node wrapping the
//          literal → `inferTypeFromInitial` fell through to `Any` (Swift
//          `@State private var n: Any = -5`). Now infers the underlying number.
//   GAP-2  A bare `i++` / `i--` STATEMENT emitted a value-position IIFE
//          (`{ let v = i; i += 1; return v }()` → "cannot call value of
//          non-function type") AND didn't promote `i` to `var`. Now emits
//          `i += 1` and promotes.
//   ARRDES `const [a, b] = xs()` was warn-dropped (object destructure already
//          lowered — array is the parallel). Now expands to a synthetic
//          container + indexed `let`s.
//   EDGE-3 A redundant `o?.a` on a PROVABLY non-optional struct is a Swift
//          error ("optional chaining on non-optional value"). Now stripped to
//          `.` when the receiver type is provably non-nullable (kept for
//          union-with-null / Any — no null-deref risk).
//
// Bisect-load-bearing: revert any one fix and its emit-shape spec + the
// combined swiftc-typecheck gate fail.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import {
  isKotlincAvailable,
  isSwiftcAvailable,
  isSwiftUIAvailable,
  validateKotlin,
  validateSwift,
  validateSwiftTypecheck,
} from '../validate'

const wrap = (body: string) =>
  `import { signal, computed } from '@pyreon/reactivity'\n` +
  `import { Stack, Text } from '@pyreon/primitives'\n` +
  `function App(){\n  ${body}\n  return (<Stack><Text>{s()}</Text></Stack>)\n}`

// ONE component exercising all five fixes — keeps the compile gates to a single
// swiftc/kotlinc invocation each (looping cold compiles blows the vitest
// timeout under full-suite parallel load).
const ALL = `import { signal, computed } from '@pyreon/reactivity'
import { Stack, Text } from '@pyreon/primitives'
function App() {
  const neg = signal(-5)
  const rows = signal([{ id: 2, name: "b" }, { id: 1, name: "a" }])
  const cfg = signal({ width: 10, tall: true })
  const rooted = computed(() => Math.floor(Math.sqrt(neg() * neg())))   // BUG-1
  const absed = computed(() => Math.abs(neg()) + 1)                     // UNARY + abs stays Int
  const counted = computed(() => { let i = 0, t = 0; while (i < 3) { t += i; i++ } return t }) // GAP-2
  const top = computed(() => { const [first] = [...rows()].sort((a, b) => a.id - b.id); return first.name }) // ARRDES + sort
  const w = computed(() => cfg()?.width ?? 0)                          // EDGE-3
  return (<Stack><Text>{rooted()}</Text><Text>{absed()}</Text><Text>{counted()}</Text><Text>{top()}</Text><Text>{w()}</Text></Stack>)
}`

describe('audit edge fixes — Math coercion / unary literal / i++ / array destructure / redundant ?.', () => {
  it('BUG-1: Double-domain Math args are coerced; abs/min/max stay generic', () => {
    const out = transform(wrap(`const n=signal(9); const s=computed(()=>Math.sqrt(n())+Math.floor(n()/2)+Math.ceil(n()/3))`), { target: 'swift' }).code
    expect(out).toContain('sqrt(Double(')
    expect(out).toContain('floor(Double(')
    expect(out).toContain('ceil(Double(')
    const absOut = transform(wrap(`const n=signal(9); const s=computed(()=>Math.abs(n())+Math.min(n(),3))`), { target: 'swift' }).code
    expect(absOut).toContain('abs(n)') // NOT abs(Double(n)) — generic, stays Int
    expect(absOut).toContain('min(n, 3)')
  })

  it('UNARY: negative/positive literal signals infer the number type (not Any)', () => {
    expect(transform(wrap(`const n=signal(-5); const s=computed(()=>n()+1)`), { target: 'swift' }).code).toContain('var n: Int = -5')
    expect(transform(wrap(`const p=signal(-9.5); const s=computed(()=>p()*2)`), { target: 'swift' }).code).toContain('var p: Double = -9.5')
    expect(transform(wrap(`const n=signal(-5); const s=computed(()=>n()+1)`), { target: 'kotlin' }).code).toContain('mutableStateOf(-5)')
  })

  it('GAP-2: bare i++ STATEMENT emits `i += 1` (not the value-position IIFE) and promotes i to var', () => {
    const sw = transform(wrap(`const s=computed(()=>{let i=0;while(i<3){i++}return i})`), { target: 'swift' }).code
    expect(sw).toContain('var i = 0') // promoted from let
    expect(sw).toContain('i += 1')
    expect(sw).not.toContain('let __v') // not the IIFE
    const kt = transform(wrap(`const s=computed(()=>{let i=0;while(i<3){i++}return i})`), { target: 'kotlin' }).code
    expect(kt).toContain('i += 1')
  })

  it('ARRDES: array destructure expands to a synthetic container + indexed lets', () => {
    const sw = transform(wrap(`const xs=signal([1,2,3]); const s=computed(()=>{const [a,b]=xs();return a+b})`), { target: 'swift' }).code
    expect(sw).toMatch(/let __pyDestr\d+ = xs/)
    expect(sw).toMatch(/let a = __pyDestr\d+\[0\]/)
    expect(sw).toMatch(/let b = __pyDestr\d+\[1\]/)
  })

  it('EDGE-3: redundant ?. on a provably non-optional struct is stripped to .', () => {
    const sw = transform(wrap(`const o=signal({a:1,b:2}); const s=computed(()=>o()?.a ?? 0)`), { target: 'swift' }).code
    expect(sw).toContain('o.a') // stripped
    expect(sw).not.toContain('o?.a')
  })

  it.skipIf(!isSwiftcAvailable())('combined component parses on real swiftc', () => {
    const r = validateSwift(transform(ALL, { target: 'swift' }).code)
    expect(r.ok, r.error ?? '').toBe(true)
  })

  // Bisect-load-bearing: revert any fix and this gate fails (the curated
  // `-parse` gate can't catch the type-level errors these close).
  it.skipIf(!isSwiftUIAvailable())('combined component TYPECHECKS against real SwiftUI', () => {
    const r = validateSwiftTypecheck(transform(ALL, { target: 'swift' }).code)
    expect(r.ok, r.error ?? '').toBe(true)
  })

  it.skipIf(!isKotlincAvailable())('combined component compiles via kotlinc', () => {
    const r = validateKotlin(transform(ALL, { target: 'kotlin' }).code)
    expect(r.ok, r.error ?? '').toBe(true)
  })
})
