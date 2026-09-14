// Branch matrices for the Swift TYPE layer and the two places a TypeIR's
// shape decides an emit rather than only an annotation:
//
//   * `swiftUnionType` — Swift has no structural union, so the only unions
//     that survive are `T | null | undefined` (Optional<T>). The FUNCTION
//     branch is the one that bites: a bare `() -> Void?` is a function
//     RETURNING an optional, not an optional function, so it must be
//     parenthesized. Everything else degrades to `Any` / `Any?`.
//   * `isAppStorageNativeType` — `@AppStorage` accepts only
//     String/Int/Double/Bool and RawRepresentable; anything else must route
//     through `@PyreonAppStorage`'s Codable/JSON bridge or swiftc rejects the
//     property wrapper outright.
//   * `emitSwiftDynamicValue` — a `safeParse` argument is a RUNTIME map, so
//     an object literal must become `[String: Any]` rather than the
//     synthesized struct every other literal position gets.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'

const swift = (src: string) => transform(src, { target: 'swift' }).code

describe('swiftUnionType — Optional<T> is the only union Swift can express', () => {
  it('a FUNCTION branch is parenthesized before the `?`; a plain branch is not', () => {
    const out = swift(`import { Stack, Text } from '@pyreon/primitives'
export function App(props: { onTap?: () => void; label?: string }) {
  return (<Stack><Text>{props.label ?? ''}</Text></Stack>)
}`)
    // `() -> Void?` would be a function RETURNING Void? — a different type.
    expect(out).toContain('var onTap: (() -> Void)? = nil')
    expect(out).toContain('var label: String? = nil')
  })

  it('an OPTIONAL anonymous-object branch still synthesizes a NAMED struct', () => {
    const out = swift(`import { Stack, Text } from '@pyreon/primitives'
export function App(props: { conf?: { a: number } }) {
  return (<Stack><Text>{String(props.conf?.a ?? 0)}</Text></Stack>)
}`)
    expect(out).toContain('struct AppConf: Codable')
    expect(out).toContain('var conf: AppConf? = nil')
  })

  it('a MIXED union degrades to `Any`; an all-nullish union to `Any?`', () => {
    const out = swift(`import { Stack, Text } from '@pyreon/primitives'
export function App(props: { nn?: null; mix: string | number }) {
  return (<Stack><Text>{String(props.mix)}</Text></Stack>)
}`)
    // two non-nullish branches → structurally inexpressible
    expect(out).toContain('let mix: Any')
    expect(out).not.toContain('mix: String?')
    // ZERO non-nullish branches → the optional-Any arm
    expect(out).toContain('var nn: Any? = nil')
  })
})

describe('useStorage — @AppStorage vs the @PyreonAppStorage bridge', () => {
  const STORE = `import { Stack, Text } from '@pyreon/primitives'
import { useStorage } from '@pyreon/storage'
type Todo = { id: number; title: string }
type Side = 'left' | 'right'
export function App() {
  const a = useStorage<string>('k1', 'x')
  const b = useStorage<number>('k2', 1)
  const c = useStorage<boolean>('k3', false)
  const d = useStorage<Side>('k4', 'left')
  const e = useStorage<string | null>('k5', null)
  const g = useStorage<Side | null>('k8', null)
  const f = useStorage<Todo[]>('k6', [])
  const h = useStorage<Todo | null>('k9', null)
  const i = useStorage<string | number>('k10', 'z')
  return (<Stack><Text>{() => \`\${a()}\${b()}\${c()}\${d()}\${e()}\${g()}\${f().length}\${h()}\${i()}\`}</Text></Stack>)
}`

  it('the SCALARS and a string-union ENUM take the direct @AppStorage slot', () => {
    const out = swift(STORE)
    expect(out).toContain('@AppStorage("k1") private var a: String')
    expect(out).toContain('@AppStorage("k2") private var b: Int')
    expect(out).toContain('@AppStorage("k3") private var c: Bool')
    // a string-literal union lowers to `enum Side: String` — RawRepresentable,
    // so @AppStorage accepts it directly
    expect(out).toContain('enum Side: String')
    expect(out).toContain('@AppStorage("k4") private var d: Side')
  })

  it('`T | null` is native iff T is — the optional arm recurses', () => {
    const out = swift(STORE)
    expect(out).toContain('@AppStorage("k5") private var e: String?')
    expect(out).toContain('@AppStorage("k8") private var g: Side?')
    // an optional STRUCT is not native, so the bridge takes it
    expect(out).toContain('@PyreonAppStorage("k9") private var h: Todo?')
  })

  it('an ARRAY, a user STRUCT and a MIXED union all route through the bridge', () => {
    const out = swift(STORE)
    expect(out).toContain('@PyreonAppStorage("k6") private var f: [Todo]')
    expect(out).toContain('@PyreonAppStorage("k10") private var i:')
    // and none of those may reach the raw wrapper — swiftc rejects it
    expect(out).not.toContain('@AppStorage("k6")')
    expect(out).not.toContain('@AppStorage("k9")')
    expect(out).not.toContain('@AppStorage("k10")')
  })

  it('a TS `enum` declaration is NOT a native enum, and is named as such', () => {
    // The stated remedy is the string-literal union above; a TS enum emits
    // nothing, so a reference to it would not compile.
    const r = transform(
      `import { Stack, Text } from '@pyreon/primitives'
enum Side { Left = 'left' }
export function App() {
  return (<Stack><Text>{Side.Left}</Text></Stack>)
}`,
      { target: 'swift' },
    )
    expect(
      r.warnings.some((w) => w.includes('Top-level TS `enum Side` is NOT compiled to native')),
    ).toBe(true)
  })
})

describe('emitSwiftDynamicValue — a safeParse argument is a runtime map, not a struct', () => {
  const V = `import { Text } from '@pyreon/primitives'
import { computed, signal } from '@pyreon/reactivity'
import { s } from '@pyreon/validate'
`

  it('object and array literals recurse; the EMPTY forms get their typed empties', () => {
    const out = swift(
      V + `export function App() {
  const a = computed(() => s.object({ n: s.number() }).safeParse({ n: 1, nested: { p: 'q' }, arr: [1, { z: 2 }], empty: {}, ea: [] }).success)
  return (<Text>{String(a())}</Text>)
}`,
    )
    expect(out).toContain(
      '["n": 1, "nested": ["p": "q"] as [String: Any], "arr": [1, ["z": 2] as [String: Any]], "empty": [String: Any](), "ea": [Any]()] as [String: Any]',
    )
    // never the synthesized-struct form every other literal position gets
    expect(out).not.toContain('safeParseResult(__Obj')
  })

  it('an object literal WITH A SPREAD, and a non-literal argument, fall to the ordinary expr emit', () => {
    const out = swift(
      V + `export function App() {
  const base = signal<{ n: number }>({ n: 2 })
  const b = computed(() => s.object({ n: s.number() }).safeParse({ ...base(), n: 3 }).success)
  const c = computed(() => s.object({ n: s.number() }).safeParse(base()).success)
  return (<Text>{\`\${b()}\${c()}\`}</Text>)
}`,
    )
    // a spread cannot be flattened into a dictionary literal here
    expect(out).toContain('safeParseResult((n: 3))')
    // an identifier is already `[String: Any]`-shaped by contract
    expect(out).toContain('safeParseResult(base)')
  })
})
