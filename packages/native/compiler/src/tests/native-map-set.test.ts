// Zero-silent-drops (P1) — Map/Set collection vocabulary (both targets).
//
// `new Map/Set` were warn-dropped to the `""` sentinel — the accumulator +
// dedup idioms (`const m = new Map(); m.set(...)` / `const seen = new
// Set(); seen.has/add`) emitted `let m = ""` and every method call broke.
// Now lowered:
//   new Map<K,V>()   → Swift `[K: V]()`            / Kotlin `mutableMapOf<K, V>()`
//   new Set<T>()     → Swift `Set<T>()`             / Kotlin `mutableSetOf<T>()`
//   new Set(arr)     → Swift `Set(arr)`             / Kotlin `(arr).toMutableSet()`
//   m.set(k, v)      → `m[k] = v` (both; the SIGNAL-set rewrite is now gated
//                      to ONE argument — a 2-arg .set is never a signal write)
//   m.get(k)         → `m[k]` (V? both — faithful to JS's `V | undefined`;
//                      inference → union so `?? fallback` collapses)
//   m.has(k)         → Swift `(m[k] != nil)` / Kotlin `containsKey`
//   m.delete(k)      → Swift `removeValue(forKey:)` / Kotlin `remove`
//   set.add/has/delete → insert/contains/remove (Swift) · add/contains/remove
//   .size            → Swift `.count` / Kotlin `.size` · .clear() → removeAll/clear
// Swift collection LOCALS force `var` (subscript-assign + insert are
// mutating; the reassignment tracker only sees `=`). Bare `new Map()` (no
// generics) + other `new X()` keep NAMED warnings.
//
// SIBLING FIND (the recurring pattern, 8th instance): the dedup idiom
// exposed the PLAIN 1-param multi-statement callback silently dropping its
// body (the block-body `""` sentinel — the indexed path fixed this in
// #1954, the plain path never did). Swift now emits the block; Kotlin
// emits return-free blocks (a lambda yields its last expression) and
// NAMED-warns on return-bearing bodies (labeled-return call-site wiring is
// the tracked follow-up — previously this was a SILENT drop).
//
// Bisect-load-bearing: (1) parse → everything reverts to the "" sentinel;
// (2) Swift method rewrites → map-method specs fail; (3) Kotlin rewrites →
// the mirror; (4) Swift var-forcing → the mutation specs fail "cannot
// assign through subscript"; (5) the Swift arrow block fix → the dedup
// spec drops its body again.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import {
  isKotlincAvailable,
  isSwiftUIAvailable,
  validateKotlin,
  validateSwiftTypecheck,
} from '../validate'

const A = (body: string, read = 'String(out())') =>
  `import { signal, computed } from '@pyreon/reactivity'\n` +
  `import { Stack, Text } from '@pyreon/primitives'\n` +
  `export function App(){
  const nums = signal<number[]>([1, 2, 3])
${body}
  return (<Stack><Text>{${read}}</Text></Stack>)
}`

const ACCUM = A(`  const out = computed(() => {
    const m = new Map<string, number>()
    m.set("a", 1)
    m.set("b", 2)
    return m.size
  })`)

const DEDUP = A(`  const out = computed(() => {
    const seen = new Set<number>()
    return nums().filter((x: number) => { if (seen.has(x)) return false; seen.add(x); return true }).length
  })`)

describe('P1 — Map/Set vocabulary (both targets)', () => {
  it('Swift: the Map accumulator idiom lowers end-to-end (var local, subscript writes, .count)', () => {
    const rs = transform(ACCUM, { target: 'swift' })
    expect(rs.code).toContain('var m = [String: Int]()')
    expect(rs.code).toContain('m["a"] = 1')
    expect(rs.code).toContain('m.count')
    expect(rs.warnings).toHaveLength(0)
  })
  it('Kotlin: the same lowers to mutableMapOf + subscript writes + .size', () => {
    const rk = transform(ACCUM, { target: 'kotlin' })
    expect(rk.code).toContain('mutableMapOf<String, Int>()')
    expect(rk.code).toContain('m["a"] = 1')
    expect(rk.warnings).toHaveLength(0)
  })
  it('m.get(k) ?? 0 collapses (V? faithful to JS V | undefined)', () => {
    const rs = transform(
      A(`  const out = computed(() => {
    const m = new Map<string, number>()
    m.set("a", 1)
    return m.get("a") ?? 0
  })`),
      { target: 'swift' },
    )
    expect(rs.code).toContain('(m["a"] ?? 0)')
    expect(rs.code).toContain('var out: Int {')
  })
  it('has/delete lower per-target (Swift nil-check + removeValue; Kotlin containsKey + remove)', () => {
    const src = A(`  const out = computed(() => {
    const m = new Map<string, number>()
    m.set("k", 1)
    if (m.has("k")) { m.delete("k") }
    return m.size
  })`)
    const rs = transform(src, { target: 'swift' })
    expect(rs.code).toContain('(m["k"] != nil)')
    expect(rs.code).toContain('m.removeValue(forKey: "k")')
    const rk = transform(src, { target: 'kotlin' })
    expect(rk.code).toContain('m.containsKey("k")')
    expect(rk.code).toContain('m.remove("k")')
  })
  it('Swift: the Set dedup idiom lowers fully (multi-statement plain callback — the sibling find)', () => {
    const rs = transform(DEDUP, { target: 'swift' })
    expect(rs.code).toContain('var seen = Set<Int>()')
    expect(rs.code).toContain('seen.contains(x)')
    expect(rs.code).toContain('seen.insert(x)')
    expect(rs.code).not.toContain('{ x in "" }')
    expect(rs.warnings).toHaveLength(0)
  })
  it('Kotlin: a return-bearing multi-statement callback warns NAMED (was a SILENT sentinel drop)', () => {
    const rk = transform(DEDUP, { target: 'kotlin' })
    expect(rk.warnings.some((w) => w.includes('early returns'))).toBe(true)
  })
  it('new Set(arr) seeds from the array on both targets', () => {
    const src = A(`  const out = computed(() => new Set(nums()).size)`)
    expect(transform(src, { target: 'swift' }).code).toContain('Set(nums).count')
    expect(transform(src, { target: 'kotlin' }).code).toContain('.toMutableSet()')
  })
  it('guards: bare new Map() (no generics) + new Foo() keep NAMED warnings; signal.set unchanged', () => {
    const bare = transform(A(`  const out = computed(() => { const m = new Map(); return 1 })`), {
      target: 'swift',
    })
    expect(bare.warnings.some((w) => w.includes('generic type arguments'))).toBe(true)
    const foo = transform(A(`  const out = computed(() => { const d = new Foo(); return 1 })`), {
      target: 'swift',
    })
    expect(foo.warnings.length).toBeGreaterThan(0)
    const sig = transform(
      A(`  const c = signal<number>(0)
  const onTap = () => { c.set(5) }
  const out = computed(() => c())`),
      { target: 'swift' },
    )
    expect(sig.code).toContain('c = 5')
  })

  // Compile proofs — accumulator + get?? + dedup in one component.
  const proof = A(`  const grouped = computed(() => {
    const m = new Map<string, number>()
    m.set("evens", nums().filter((x: number) => x % 2 === 0).length)
    m.set("odds", nums().filter((x: number) => x % 2 === 1).length)
    return (m.get("evens") ?? 0) + m.size
  })
  const uniq = computed(() => new Set(nums()).size)
  const out = computed(() => grouped() + uniq())`)
  it.skipIf(!isSwiftUIAvailable())('iOS: the Map/Set component TYPECHECKS against real SwiftUI', () => {
    const r = validateSwiftTypecheck(transform(proof, { target: 'swift' }).code)
    expect(r.ok, r.error ?? '').toBe(true)
  })
  it.skipIf(!isKotlincAvailable())('Android: the same compiles via kotlinc', () => {
    const r = validateKotlin(transform(proof, { target: 'kotlin' }).code)
    expect(r.ok, r.error ?? '').toBe(true)
  })
})
