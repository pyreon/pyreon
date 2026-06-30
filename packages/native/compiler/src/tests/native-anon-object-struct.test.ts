// Untyped object-literal signals → a synthesized struct (was: `Any`).
//
// `signal({ x: 1, y: 2 })` and `signal([{ id: 1, name: "a" }])` (no generic)
// emitted `@State private var o: Any = __Obj0(...)` on Swift — the emit
// synthesized a struct for the VALUE (`__Obj0`) but the TYPE annotation was
// `Any`, so the variable couldn't be used downstream (swiftc fails; `-parse`
// misses it). Kotlin emits no annotation so it half-worked.
//
// Two parts, landed together:
//  (a) `inferTypeFromInitial` (parse.ts) infers a FLAT-SCALAR object TypeIR
//      from the literal (every field a number/string/boolean; a spread /
//      nested-object / array field bails to `Any` — unchanged).
//  (b) the type-path struct synth (`swiftType`, emit-swift) registers the
//      synthesized name in `_structFieldsToName`, so the VALUE path (object-
//      literal emit, which looks that registry up by field-shape) reuses the
//      SAME name instead of a divergent `__ObjN`. @State emits the type
//      before the value, so the registration is in time → annotation `[AppRow]`
//      == value `[AppRow]`.
//
// Scalar records are the dominant shape and are fully supported on BOTH
// targets; array-field / nested objects stay `Any` (the Kotlin emit-ordering
// follow-up).

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

// SINGLE source for the compile gates (one swiftc/kotlinc invocation each —
// looping cold kotlinc per shape blew the 60s test timeout under parallel load).
const ALL = `import { Stack, Text } from '@pyreon/primitives'
function App() {
  const o = signal({ x: 1, y: 2 })
  const rows = signal([{ id: 1, name: "a" }])
  const todos = signal([{ id: 1, text: "a", done: false }])
  const sum = computed(() => o().x + o().y)
  const names = computed(() => rows().map((r) => r.name).join(","))
  const left = computed(() => todos().filter((t) => !t.done).length)
  return (<Stack><Text>{String(sum() + names().length + left())}</Text></Stack>)
}`

describe('untyped object-literal signals → synthesized struct (not Any)', () => {
  it('Swift: type annotation == value struct name (synthesized), not Any', () => {
    const out = transform(ALL, { target: 'swift' }).code
    // single scalar object: annotation and value use the SAME synthesized name
    expect(out).toMatch(/@State private var o: (App\w+) = \1\(x: 1, y: 2\)/)
    // array of scalar records: [Struct] = [Struct(...)]
    expect(out).toMatch(/@State private var rows: \[(App\w+)\] = \[\1\(id: 1, name: "a"\)\]/)
    expect(out).not.toContain(': Any =') // no Any-typed object signal
    expect(out).not.toContain('__Obj') // no divergent value-path struct
  })

  it('Kotlin: object signals construct the data class (not a broken tuple)', () => {
    const out = transform(ALL, { target: 'kotlin' }).code
    expect(out).toContain('data class')
    expect(out).not.toMatch(/mutableStateOf\(\(\w+ =/) // no `(x = …)` tuple value
  })

  it.skipIf(!isSwiftcAvailable())('parses via swiftc', () => {
    const r = validateSwift(transform(ALL, { target: 'swift' }).code)
    expect(r.ok, r.error ?? '').toBe(true)
  })

  // Bisect-load-bearing: before the fix `o`/`rows` were `Any` (Swift) → could
  // not be read downstream → swiftc TYPE error (`-parse` misses it).
  it.skipIf(!isSwiftUIAvailable())('TYPECHECKS against real SwiftUI', () => {
    const r = validateSwiftTypecheck(transform(ALL, { target: 'swift' }).code)
    expect(r.ok, r.error ?? '').toBe(true)
  })

  it.skipIf(!isKotlincAvailable())('compiles via kotlinc', () => {
    const r = validateKotlin(transform(ALL, { target: 'kotlin' }).code)
    expect(r.ok, r.error ?? '').toBe(true)
  })

  it('nested / array-field objects bail to Any (documented, no regression)', () => {
    const nested = `import { Stack, Text } from '@pyreon/primitives'
function App() {
  const p = signal({ pt: { x: 1, y: 2 } })
  return (<Stack><Text>x</Text></Stack>)
}`
    // nested object is NOT inferred to a struct — stays Any (not a half-fix)
    const out = transform(nested, { target: 'swift' }).code
    expect(out).toContain('var p: Any')
  })
})
