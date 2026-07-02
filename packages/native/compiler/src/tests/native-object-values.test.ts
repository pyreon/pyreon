// Zero-silent-drops (P1) — `Object.values()` faithful lowering + the
// `Object.keys()` declared-struct (typeRef) gap.
//
// `Object.values(x)` had NO lowering — every form degrade-warned to a typed
// empty array (`[Any]()` / `emptyList<Any>()`), which at least warned but
// dropped the real values. And probing it exposed a SIBLING gap (the
// recurring root-cause pattern): `Object.keys(p())` on a DECLARED type
// (`signal<P>` where `type P = {…}` — the dominant real shape) ALSO
// degrade-warned, because `rewriteObjectKeys`' type-resolution path only
// handled the inline `object` type kind, not `typeRef`.
//
// Fix: a shared `objectFieldsOf` resolves a field list from an inline
// `object` type OR a `typeRef` via the module's struct registry (closing
// the keys gap), and the new `rewriteObjectValues` lowers
// `Object.values(<object-typed expr>)` to a static member-access array
// (`[p.a, p.b]` / `listOf(p.a, p.b)` — field order = declaration order,
// matching JS's insertion-order guarantee). Two faithfulness gates:
// ALL field types identical (JS's mixed values array has no native analog)
// AND the arg re-readable (`isReReadableExpr` — it's named once per field).
// Anything else keeps the degrade-warn (never a silent drop);
// `Object.entries` stays degrade-warn (tuple arrays don't map cleanly).
//
// Bisect-load-bearing: (1) neuter `rewriteObjectValues` → the values specs
// fall back to warn+`[Any]()`; (2) neuter `objectFieldsOf`'s typeRef branch
// → the DECLARED-type keys + values specs fail while the inline-literal
// forms still pass.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import {
  isKotlincAvailable,
  isSwiftUIAvailable,
  validateKotlin,
  validateSwiftTypecheck,
} from '../validate'

const sw = (src: string) => transform(src, { target: 'swift' })
const kt = (src: string) => transform(src, { target: 'kotlin' })

const P = (body: string) =>
  `import { signal, computed } from '@pyreon/reactivity'\n` +
  `import { Stack, Text } from '@pyreon/primitives'\n` +
  `type P = { a: number; b: number }\n` +
  `export function App(){
  const p = signal<P>({ a: 1, b: 2 })
${body}
  return (<Stack><Text>{String(out().length)}</Text></Stack>)
}`

describe('P1 — Object.values lowering + Object.keys typeRef gap', () => {
  it('Swift: `Object.values(p())` on a declared struct → `[p.a, p.b]` typed [Int]', () => {
    const rs = sw(P(`  const out = computed(() => Object.values(p()))`))
    expect(rs.code).toContain('var out: [Int] { [p.a, p.b] }')
    expect(rs.warnings).toHaveLength(0)
  })
  it('Kotlin: the same lowers to `listOf(p.a, p.b)`', () => {
    const rk = kt(P(`  const out = computed(() => Object.values(p()))`))
    expect(rk.code).toContain('listOf(p.a, p.b)')
    expect(rk.warnings).toHaveLength(0)
  })
  it('Swift: `Object.keys(p())` on a DECLARED type now lowers (the typeRef gap)', () => {
    const rs = sw(P(`  const out = computed(() => Object.keys(p()))`))
    expect(rs.code).toContain('var out: [String] { ["a", "b"] }')
    expect(rs.warnings).toHaveLength(0)
  })
  it('Swift: the inline-literal form `Object.values({x: 1, y: 2})` lowers to the values', () => {
    const rs = sw(P(`  const out = computed(() => Object.values({ x: 1, y: 2 }))`))
    expect(rs.code).toContain('var out: [Int] { [1, 2] }')
  })

  // Faithfulness gates — degrade-warn, never silent.
  it('guards: MIXED field types + Object.entries keep the NAMED degrade-warn', () => {
    const mixed = sw(`import { signal, computed } from '@pyreon/reactivity'
import { Stack, Text } from '@pyreon/primitives'
type M = { a: number; b: string }
export function App(){
  const p = signal<M>({ a: 1, b: "x" })
  const out = computed(() => Object.values(p()))
  return (<Stack><Text>{String(out().length)}</Text></Stack>)
}`)
    expect(mixed.warnings.some((w) => w.includes('Object.values'))).toBe(true)
    expect(mixed.code).toContain('[Any]()')
    const entries = sw(P(`  const out = computed(() => Object.entries(p()))`))
    expect(entries.warnings.some((w) => w.includes('Object.entries'))).toBe(true)
  })
  it('guard: a chained (non-re-readable) receiver keeps the degrade-warn', () => {
    const rs = sw(`import { signal, computed } from '@pyreon/reactivity'
import { Stack, Text } from '@pyreon/primitives'
type P = { a: number; b: number }
export function App(){
  const items = signal<P[]>([{ a: 1, b: 2 }])
  const out = computed(() => Object.values(items().filter((x: P) => x.a > 0)[0]))
  return (<Stack><Text>{String(out().length)}</Text></Stack>)
}`)
    expect(rs.warnings.some((w) => w.includes('Object.values'))).toBe(true)
  })
  it('control: `Object.keys({x: 1, y: 2})` inline form unchanged', () => {
    expect(sw(P(`  const out = computed(() => Object.keys({ x: 1, y: 2 }))`)).code).toContain(
      '["x", "y"]',
    )
  })

  // Compile proof — declared-struct keys + values in one component through
  // real swiftc + kotlinc (a settings/summary panel shape).
  const proof = `import { signal, computed } from '@pyreon/reactivity'
import { Stack, Text } from '@pyreon/primitives'
type Scores = { math: number; art: number; gym: number }
export function App(){
  const s = signal<Scores>({ math: 80, art: 90, gym: 70 })
  const names = computed(() => Object.keys(s()))
  const total = computed(() => Object.values(s()).reduce((a: number, b: number) => a + b, 0))
  const out = computed(() => String(names().length) + " " + String(total()))
  return (<Stack><Text>{out()}</Text></Stack>)
}`
  it.skipIf(!isSwiftUIAvailable())('iOS: keys+values summary component TYPECHECKS against real SwiftUI', () => {
    const r = validateSwiftTypecheck(sw(proof).code)
    expect(r.ok, r.error ?? '').toBe(true)
  })
  it.skipIf(!isKotlincAvailable())('Android: the same component compiles via kotlinc', () => {
    const r = validateKotlin(kt(proof).code)
    expect(r.ok, r.error ?? '').toBe(true)
  })
})
