// `infer-type.ts`'s CONTAINER-read arms — the shapes where the type of a value
// is decided by which HOOK produced it rather than by an expression:
//   • a `useFetch` container, in BOTH the CALL form (`q.data()`, what shared
//     source writes because web reads a signal) and the MEMBER form (`q.data`,
//     the native shape);
//   • a standalone `s.object({…}).safeParse(x)` result;
//   • `new Set(seed)` and the zero-argument `Math.*` guards.
//
// The fetch arms matter because `data` is OPTIONAL at every layer (web is
// `signal<T | undefined>`, Swift `T?`, Kotlin `MutableState<T?>`) and inferring
// a bare `T` makes the receiver look provably non-null — which strips the `?.`
// the author wrote.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'

const swift = (src: string): string => transform(src, { target: 'swift' }).code
const kotlin = (src: string): string => transform(src, { target: 'kotlin' }).code

function fetchApp(decls: string, elem = 'Q'): string {
  return `import { Stack, Text } from '@pyreon/primitives'
import { computed } from '@pyreon/reactivity'
import { useFetch } from '@pyreon/http'
type Q = { id: number; text: string }
export function App() {
  const q = useFetch<${elem}>('https://example.test/q.json')
${decls}
  return (<Stack><Text>ok</Text></Stack>)
}`
}

const annot = (decls: string, name: string, elem?: string): string =>
  swift(fetchApp(decls, elem))
    .split('\n')
    .find((l) => l.includes(`private var ${name}:`))
    ?.trim() ?? '(missing)'

describe('useFetch container — the CALL form (what shared source actually writes)', () => {
  it('`q.data()` is OPTIONAL — the whole reason this arm exists', () => {
    expect(annot(`  const a = computed(() => q.data())`, 'a')).toContain('var a: Q?')
  })

  it('`q.isPending()` is a boolean', () => {
    expect(annot(`  const b = computed(() => q.isPending())`, 'b')).toContain('var b: Bool')
  })

  it('`q.error()` is an OPTIONAL — a bare error is not a Bool condition on either target', () => {
    // The runtime field is `Error?` (not `String?`, which this spec used to
    // assert — an annotation that could not hold the value it computed).
    expect(annot(`  const c = computed(() => q.error())`, 'c')).toContain('var c: Error?')
  })

  it('an ALREADY-optional payload type is not double-wrapped', () => {
    expect(annot(`  const a = computed(() => q.data())`, 'a', 'Q | undefined')).toContain('var a: Q?')
  })

  it('`q.data() ?? []` UNWRAPS to the array — the dominant device-proven shape', () => {
    expect(annot(`  const a = computed(() => q.data() ?? [])`, 'a', 'Q[]')).toContain('var a: [Q]')
  })

  it('an unrelated property on the container does not take these arms', () => {
    expect(annot(`  const z = computed(() => q.nope())`, 'z')).toContain('var z: Any')
  })
})

describe('useFetch container — the MEMBER form', () => {
  it('`q.data` / `q.isPending` mirror the call-form branch', () => {
    expect(annot(`  const b = computed(() => q.isPending)`, 'b')).toContain('var b: Bool')
    expect(annot(`  const a = computed(() => q.data)`, 'a', 'Q[]')).toContain('var a: [Q]')
  })

  it('Kotlin reads the same container fields', () => {
    const out = kotlin(fetchApp(`  const b = computed(() => q.isPending())`))
    expect(out).toContain('q.isPending')
  })
})

describe('standalone schema validation — `safeParse` and its fields', () => {
  const schemaApp = (decls: string): string => `import { Stack, Text } from '@pyreon/primitives'
import { computed } from '@pyreon/reactivity'
import { s } from '@pyreon/validate'
export function App() {
${decls}
  return (<Stack><Text>ok</Text></Stack>)
}`
  const sAnnot = (decls: string, name: string): string =>
    swift(schemaApp(decls))
      .split('\n')
      .find((l) => l.includes(`private var ${name}:`))
      ?.trim() ?? '(missing)'

  it('`.success` is a Bool — read off the schema-validate node, so the computed is precise', () => {
    expect(
      sAnnot(`  const a = computed(() => s.object({ n: s.number() }).safeParse({ n: 1 }).success)`, 'a'),
    ).toContain('var a: Bool')
  })

  it('`.data` stays unknown (the optional validated value is not modelled)', () => {
    expect(
      sAnnot(`  const b = computed(() => s.object({ n: s.number() }).safeParse({ n: 1 }).data)`, 'b'),
    ).toContain('var b: Any')
  })

  it('the bare result is unknown too — `let r: Any` compiles, so this is never a broken emit', () => {
    expect(
      sAnnot(`  const c = computed(() => s.object({ n: s.number() }).safeParse({ n: 1 }))`, 'c'),
    ).toContain('var c: Any')
  })

  it('the emit routes through the synthesized schema, not a data class', () => {
    expect(
      swift(schemaApp(`  const a = computed(() => s.object({ n: s.number() }).safeParse({ n: 1 }).success)`)),
    ).toContain('PyreonZodSchema_')
  })
})

describe('new-collection / Math guards', () => {
  const app = (decls: string): string => `import { Stack, Text } from '@pyreon/primitives'
import { signal, computed } from '@pyreon/reactivity'
export function App() {
  const s2 = signal('a')
  const xs = signal<number[]>([1])
  const n = signal(1)
${decls}
  return (<Stack><Text>ok</Text></Stack>)
}`
  const a = (decls: string, name: string): string =>
    swift(app(decls))
      .split('\n')
      .find((l) => l.includes(`private var ${name}:`))
      ?.trim() ?? '(missing)'

  it('`new Set(<array>)` takes the ELEMENT type from the seed', () => {
    expect(a(`  const v = computed(() => new Set(xs()))`, 'v')).toContain('var v: Set<Int>')
  })

  it('`new Set(<non-array>)` degrades rather than guessing', () => {
    expect(a(`  const v = computed(() => new Set(s2()))`, 'v')).toContain('var v: Set<Any>')
  })

  it('an EXPLICIT element type wins over the seed', () => {
    expect(a(`  const v = computed(() => new Set<string>())`, 'v')).toContain('var v: Set<String>')
  })

  it('`new Map<K, V>()` carries both declared generics', () => {
    expect(a(`  const v = computed(() => new Map<string, number>())`, 'v')).toContain(
      'var v: [String: Int]',
    )
  })

  it('`Math.abs()` with NO argument falls to the unknown-arg branch, not a crash', () => {
    expect(a(`  const v = computed(() => Math.abs())`, 'v')).toContain('var v: Int')
  })

  it('`Math.min()` with no arguments is Int (no float argument to contaminate it)', () => {
    expect(a(`  const v = computed(() => Math.min())`, 'v')).toContain('var v: Int')
  })
})
