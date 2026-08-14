// Reactive `Map`/`Set` signals → native collections (was: `Any`).
//
// `signal(new Set<string>())` / `signal(new Map<string, number>())` emitted
// `@State private var seen: Any = Set<String>()` on Swift — the CONSTRUCTION
// was already native (`Set<String>()` / `[String: Int]()`) and the emitters
// already carried the full Map/Set method vocabulary (`.size`/`.has`/`.get`/
// `.add`/`.set`/`.delete`/`.clear`, all typed off the RECEIVER's inferred
// kind), but the signal's DECLARED type degraded to `Any`. So `inferType`
// resolved the receiver `seen()` to `Any`, none of the Map/Set lowerings
// fired, and `.size`/`.has`/`.get` passed through verbatim (`seen.size` /
// `seen.has("a")`) — hard swiftc/kotlinc type errors.
//
// The root fix is one line in the signal-decl type path: `inferTypeFromInitial`
// (parse.ts) now maps a `new-collection` ExprIR → the `set`/`map` TypeIR the
// downstream type mapper + method lowerings already consume. So the annotation
// and its reads finally agree on one native collection type.
//
// v1 scope (bounded, verifiable on BOTH real toolchains):
//  - Set<scalar>, Map<scalar, scalar> (scalar = number/string/boolean).
//  - READ surface: `.size`→`.count`(Swift)/`.size`(Kotlin), `.has`→`.contains`
//    /`.containsKey`/`[k] != nil`, `.get`→`map[k]` (Optional).
//  - Construction: `new Set<T>()`, `new Set([scalars])`, `new Map<K,V>()`.
//  - Mutations `.add`/`.delete`/`.set`/`.clear` TYPE-CHECK (pre-existing
//    emitter wiring) — reactive on Swift (@State value mutation). On Kotlin
//    in-place content mutation of a `mutableStateOf(mutableSetOf())` is not
//    observed by Compose recomposition; a snapshot-replace (`seen.set(...)`) is
//    the reactive path there (documented follow-up).
//  - WARNS (never a silent mis-emit): non-scalar element/key/value types
//    (`Set<{...}>`, `Map<string, {...}>` — a non-scalar Swift Set element is a
//    hard `does not conform to Hashable` error), and seeded `new Map([...])`
//    (the entry-array lowering is a follow-up).

import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import {
  isSwiftcAvailable,
  isKotlincAvailable,
  validateSwiftWithStubs,
  validateKotlin,
} from '../validate'

// SINGLE source for the compile gates (one swiftc/kotlinc invocation each).
const APP = `import { Stack, Text, Press } from '@pyreon/primitives'
function App() {
  const seen = signal(new Set<string>())
  const nums = signal(new Set([1, 2, 3]))
  const counts = signal(new Map<string, number>())
  const flags = signal(new Map<string, boolean>())
  return (<Stack>
    <Text>{String(seen().size)}</Text>
    <Text>{String(nums().size)}</Text>
    <Text>{String(counts().size)}</Text>
    <Text>{String(seen().has("a"))}</Text>
    <Text>{String(counts().has("a"))}</Text>
    <Text>{String(counts().get("a") ?? 0)}</Text>
    <Text>{String(flags().get("f") ?? false)}</Text>
    <Press onPress={() => { seen().add("c") }}><Text>add</Text></Press>
    <Press onPress={() => { seen().delete("a") }}><Text>del</Text></Press>
    <Press onPress={() => { counts().set("x", 1) }}><Text>set</Text></Press>
    <Press onPress={() => { counts().clear() }}><Text>clear</Text></Press>
  </Stack>)
}`

describe('reactive Map/Set signals → native collections (not Any)', () => {
  it('Swift: signal type annotation is the native collection, reads lower', () => {
    const out = transform(APP, { target: 'swift' }).code
    // The signal is typed as the native collection, not Any.
    expect(out).toContain('@State private var seen: Set<String> = Set<String>()')
    expect(out).toContain('@State private var counts: [String: Int] = [String: Int]()')
    expect(out).toContain('@State private var flags: [String: Bool] = [String: Bool]()')
    // seeded Set element inferred from the literal.
    expect(out).toContain('@State private var nums: Set<Int> = Set([1, 2, 3])')
    expect(out).not.toContain(': Any =')
    // reads lower to the native ops (were: verbatim `.size`/`.has`/`.get`).
    expect(out).toContain('seen.count')
    expect(out).toContain('seen.contains("a")')
    expect(out).toContain('(counts["a"] != nil)')
    expect(out).toContain('(counts["a"] ?? 0)')
    // mutations lower (pre-existing vocab, now firing on the signal receiver).
    expect(out).toContain('seen.insert("c")')
    expect(out).toContain('seen.remove("a")')
    expect(out).toContain('counts["x"] = 1')
    expect(out).toContain('counts.removeAll()')
  })

  it('Kotlin: signal constructs the native collection, reads lower', () => {
    const out = transform(APP, { target: 'kotlin' }).code
    expect(out).toContain('mutableStateOf(mutableSetOf<String>())')
    expect(out).toContain('mutableStateOf(mutableMapOf<String, Int>())')
    expect(out).toContain('mutableStateOf(mutableMapOf<String, Boolean>())')
    // `.has`→`.contains`/`.containsKey`, `.get`→`[k]` (were: verbatim, uncompilable).
    expect(out).toContain('seen.contains("a")')
    expect(out).toContain('counts.containsKey("a")')
    expect(out).toContain('(counts["a"] ?: 0)')
    // mutations
    expect(out).toContain('seen.add("c")')
    expect(out).toContain('seen.remove("a")')
    expect(out).toContain('counts["x"] = 1')
    expect(out).toContain('counts.clear()')
  })

  it.skipIf(!isSwiftcAvailable())('Swift type-checks against the stub', () => {
    const r = validateSwiftWithStubs(transform(APP, { target: 'swift' }).code)
    expect(r.ok, r.error ?? '').toBe(true)
  })

  it.skipIf(!isKotlincAvailable())('Kotlin compiles on kotlinc', () => {
    const r = validateKotlin(transform(APP, { target: 'kotlin' }).code)
    expect(r.ok, r.error ?? '').toBe(true)
  })

  // Out-of-scope shapes WARN (never a silent mis-emit). A non-scalar Swift Set
  // element is a hard `does not conform to Hashable` type error — before the
  // scope guard it emitted `Set<CData>` with ZERO warning.
  it('WARNS on a non-scalar Set element (Set of objects)', () => {
    const src = `import { Stack, Text } from '@pyreon/primitives'
function App() {
  const s = signal(new Set<{ x: number }>())
  return (<Stack><Text>{String(s().size)}</Text></Stack>)
}`
    for (const target of ['swift', 'kotlin'] as const) {
      const r = transform(src, { target })
      expect(
        (r.warnings ?? []).some((w) => w.includes('non-scalar element type')),
        `${target} should warn`,
      ).toBe(true)
    }
  })

  it('WARNS on a non-scalar Map value (Map of structs)', () => {
    const src = `import { Stack, Text } from '@pyreon/primitives'
function App() {
  const m = signal(new Map<string, { x: number }>())
  return (<Stack><Text>{String(m().size)}</Text></Stack>)
}`
    const r = transform(src, { target: 'swift' })
    expect(
      (r.warnings ?? []).some((w) => w.includes('non-scalar key or value')),
    ).toBe(true)
  })

  it('WARNS on a seeded `new Map([...])` (entry-array lowering is a follow-up)', () => {
    const src = `import { Stack, Text } from '@pyreon/primitives'
function App() {
  const m = signal(new Map<string, number>([["a", 1]]))
  return (<Stack><Text>{String(m().size)}</Text></Stack>)
}`
    const r = transform(src, { target: 'swift' })
    expect((r.warnings ?? []).some((w) => w.includes('seeded `new Map'))).toBe(true)
  })
})
