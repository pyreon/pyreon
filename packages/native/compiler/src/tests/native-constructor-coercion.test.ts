// Zero-silent-drops (P1) — `String(x)` / `Boolean(x)` coercion constructors
// as VALUES.
//
// `String(x)`'s EMIT was already valid on both targets (Swift's `String(x)`
// initializer / Kotlin's `.toString()` rewrite) but `inferType` had no case,
// so the RESULT typed `Any` — which broke any typed consumer: an array
// literal `["v", String(n())]` degraded to `[Any]` and a chained `.length`
// failed Swift ("value of type 'Any' has no member 'count'").
//
// `Boolean(x)` was DOUBLY broken: no inference case AND no emit mapping —
// the raw `Boolean(n)` fails BOTH targets (Swift "cannot find 'Boolean' in
// scope"; Kotlin "unresolved reference"). JS `Boolean(x)` is truthiness
// coercion as a value, so the emit lowers by the arg's INFERRED type,
// JS-exact for the scalar shapes: bool → identity; number → `!= 0`;
// string → non-empty; optional number/string → check the INNER value
// (`(x ?? 0) != 0` — JS Boolean(undefined) = Boolean(0) = false); other
// optionals → presence (`!= nil` / `!= null`, the same simplification the
// optional-truthiness condition lowering makes). An arg whose type can't
// be resolved keeps the raw emit + a NAMED warning — never a silent drop.
//
// Bisect-load-bearing pieces: (1) the `String` inference case → the
// [String]-annotation spec fails back to `[Any]`; (2) the `Boolean`
// inference case → the `Bool`-annotation specs fail back to `Any`; (3) the
// Swift `Boolean(` emit lowering → the `(n != 0)` emit spec fails to raw
// `Boolean(n)`; (4) the Kotlin lowering → the Kotlin emit spec fails.

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

const N = (body: string) =>
  `import { signal, computed } from '@pyreon/reactivity'\n` +
  `import { Stack, Text } from '@pyreon/primitives'\n` +
  `export function App(){
  const n = signal<number>(3)
${body}
  return (<Stack><Text>{String(out())}</Text></Stack>)
}`

describe('P1 — String(x) / Boolean(x) constructor-as-value', () => {
  it('Swift: `["v", String(n())]` infers [String], not [Any] (array homogeneity)', () => {
    const code = sw(
      `import { signal, computed } from '@pyreon/reactivity'\n` +
        `import { Stack, Text } from '@pyreon/primitives'\n` +
        `export function App(){
  const n = signal<number>(3)
  const out = computed(() => ["v", String(n())])
  return (<Stack><Text>{String(out().length)}</Text></Stack>)
}`,
    )
    expect(code).toContain('var out: [String] {')
    expect(code).not.toContain('var out: Any {')
  })
  it('Swift: a computed returning `String(n())` annotates String, not Any', () => {
    expect(sw(N(`  const out = computed(() => String(n()))`))).toContain('var out: String {')
  })

  it('Swift: `Boolean(number)` lowers to `(x != 0)` with a Bool annotation', () => {
    const code = sw(N(`  const out = computed(() => Boolean(n()))`))
    expect(code).toContain('var out: Bool { (n != 0) }')
    expect(code).not.toContain('Boolean(')
  })
  it('Kotlin: `Boolean(number)` lowers to `(x != 0)` (no raw Boolean call)', () => {
    const code = kt(N(`  const out = computed(() => Boolean(n()))`))
    expect(code).toContain('derivedStateOf { (n != 0) }')
    expect(code).not.toContain('Boolean(')
  })

  it('Swift: `Boolean(string)` lowers to non-empty; `Boolean(bool)` is identity', () => {
    const s = `import { signal, computed } from '@pyreon/reactivity'
import { Stack, Text } from '@pyreon/primitives'
export function App(){
  const s = signal<string>("")
  const b = signal<boolean>(true)
  const outS = computed(() => Boolean(s()))
  const out = computed(() => Boolean(b()))
  return (<Stack><Text>{String(out())}</Text></Stack>)
}`
    const code = sw(s)
    expect(code).toContain('var outS: Bool { !(s).isEmpty }')
    expect(code).toContain('var out: Bool { b }')
  })

  it('Swift: `Boolean(.find(...))` (optional struct) lowers to presence `!= nil`', () => {
    const code = sw(`import { signal, computed } from '@pyreon/reactivity'
import { Stack, Text } from '@pyreon/primitives'
type T = { id: number; label: string }
export function App(){
  const items = signal<T[]>([{ id: 1, label: "a" }])
  const out = computed(() => Boolean(items().find((t: T) => t.id === 2)))
  return (<Stack><Text>{String(out())}</Text></Stack>)
}`)
    expect(code).toContain('!= nil)')
    expect(code).toContain('var out: Bool {')
  })

  // Guard — an unresolvable arg type must WARN + keep the raw emit (loud
  // build failure), never silently drop or guess.
  it('warns + keeps the raw emit when the arg type cannot be inferred', () => {
    const src = N(`  const out = computed(() => Boolean(n() > 2 ? "a" : 0))`)
    const rs = transform(src, { target: 'swift' })
    expect(rs.warnings.some((w) => w.includes('Boolean('))).toBe(true)
    expect(rs.code).toContain('Boolean(')
  })

  // Controls — the pre-existing coercion constructors are unchanged.
  it('controls: Number("42") / parseInt("7") emits unchanged', () => {
    const num = sw(N(`  const out = computed(() => Number("42"))`))
    expect(num).toContain('(Double("42") ?? 0)')
    const pi = sw(N(`  const out = computed(() => parseInt("7"))`))
    expect(pi).toContain('(Int("7") ?? 0)')
  })

  // Compile proof — every lowering shape in ONE component, through real
  // swiftc -typecheck (vs SwiftUI) + kotlinc.
  const proof = `import { signal, computed } from '@pyreon/reactivity'
import { Stack, Text } from '@pyreon/primitives'
type T = { id: number; label: string }
export function App(){
  const n = signal<number>(3)
  const s = signal<string>("x")
  const b = signal<boolean>(true)
  const items = signal<T[]>([{ id: 1, label: "a" }])
  const labels = computed(() => ["v", String(n())])
  const hasN = computed(() => Boolean(n()))
  const hasS = computed(() => Boolean(s()))
  const hasB = computed(() => Boolean(b()))
  const found = computed(() => Boolean(items().find((t: T) => t.id === 2)))
  const out = computed(() => String(labels().length) + String(hasN()) + String(hasS()) + String(hasB()) + String(found()))
  return (<Stack><Text>{out()}</Text></Stack>)
}`
  it.skipIf(!isSwiftUIAvailable())('iOS: all lowering shapes TYPECHECK against real SwiftUI', () => {
    const r = validateSwiftTypecheck(sw(proof))
    expect(r.ok, r.error ?? '').toBe(true)
  })
  it.skipIf(!isKotlincAvailable())('Android: the same component compiles via kotlinc', () => {
    const r = validateKotlin(kt(proof))
    expect(r.ok, r.error ?? '').toBe(true)
  })
})
