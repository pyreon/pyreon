// PR1 — hook-result destructure lowering (subset widening).
//
// `const { data, isPending } = useFetch(url)` is THE idiomatic data-fetch
// shape across every list/dashboard/realtime app. Previously it WARN-DROPPED
// (zero decl emitted; every destructured local an unbound reference failing
// the real native build). Now it lowers to a synthetic single-binding
// container `const __pyHookN = useFetch(url)` + one field alias per key, so
// each local rewrites to `__pyHookN.<field>` at its use sites — producing
// emit BYTE-IDENTICAL to the supported single-binding shape on both targets.
//
//   Swift  → @State private var __pyHook0 = PyreonFetch<T>()  + __pyHook0.field
//   Kotlin → val __pyHook0 = remember { PyreonFetch<T>() }    + __pyHook0.field.value
//
// Faithful + non-regressing: a hook whose single-binding form has no
// container, or a rest/nested pattern, falls through to warn-drop. The
// lowering can only make destructure work where single-binding already works.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import { isSwiftcAvailable, isKotlincAvailable, validateSwift, validateKotlin } from '../validate'

const fetchApp = (binding: string) =>
  `import { Stack, Text } from '@pyreon/primitives'
type Quote = { text: string }
function App() {
  ${binding}
  return (<Stack><Text>{isPending}</Text><Text>{error}</Text><Text>{data()}</Text></Stack>)
}`

describe('PR1 — hook-result destructure lowering', () => {
  it('Swift: useFetch destructure emits the single-binding container + field reads', () => {
    const out = transform(fetchApp(`const { data, isPending, error } = useFetch<Quote>('https://api/q')`), {
      target: 'swift',
    }).code
    expect(out).toContain('@State private var __pyHook0 = PyreonFetch<Quote>()')
    expect(out).toContain('__pyHook0.isPending')
    expect(out).toContain('__pyHook0.error')
    // `data()` lowers to a plain property read on @Observable (same as the
    // single-binding `q.data()` → `q.data`).
    expect(out).toContain('__pyHook0.data')
    // the fetch arc still wires the mount-time .task off the synthetic name
    expect(out).toContain('__pyHook0.begin()')
  })

  it('Kotlin: useFetch destructure emits remember container + .value field reads', () => {
    const out = transform(fetchApp(`const { data, isPending, error } = useFetch<Quote>('https://api/q')`), {
      target: 'kotlin',
    }).code
    expect(out).toContain('val __pyHook0 = remember { PyreonFetch<Quote>() }')
    expect(out).toContain('__pyHook0.isPending.value')
    expect(out).toContain('__pyHook0.error.value')
    expect(out).toContain('__pyHook0.data.value')
    expect(out).toContain('__pyHook0.begin()')
  })

  it('destructure emit is byte-identical to single-binding (modulo binding name)', () => {
    for (const target of ['swift', 'kotlin'] as const) {
      const destr = transform(fetchApp(`const { data, isPending, error } = useFetch<Quote>('https://api/q')`), {
        target,
      }).code
      const single = transform(
        `import { Stack, Text } from '@pyreon/primitives'
type Quote = { text: string }
function App() {
  const q = useFetch<Quote>('https://api/q')
  return (<Stack><Text>{q.isPending}</Text><Text>{q.error}</Text><Text>{q.data()}</Text></Stack>)
}`,
        { target },
      ).code
      // Normalize the only difference: synthetic name vs user name.
      expect(destr.replaceAll('__pyHook0', 'q')).toBe(single)
    }
  })

  it('renamed keys alias correctly: `const { data: rows }`', () => {
    const src = `import { Stack, Text } from '@pyreon/primitives'
type Quote = { text: string }
function App() {
  const { data: rows, isPending: loading } = useFetch<Quote>('https://api/q')
  return (<Stack><Text>{loading}</Text><Text>{rows()}</Text></Stack>)
}`
    const sw = transform(src, { target: 'swift' }).code
    // `loading` → __pyHook0.isPending, `rows` → __pyHook0.data
    expect(sw).toContain('__pyHook0.isPending')
    expect(sw).toContain('__pyHook0.data')
    // the renamed locals must NOT leak as bare identifiers
    expect(sw).not.toMatch(/\(rows\)|\(loading\)/)
  })

  it('a second destructure in the same component gets a fresh container name', () => {
    const src = `import { Stack, Text } from '@pyreon/primitives'
type Quote = { text: string }
type User = { name: string }
function App() {
  const { isPending: aPending } = useFetch<Quote>('https://api/a')
  const { isPending: bPending } = useFetch<User>('https://api/b')
  return (<Stack><Text>{aPending}</Text><Text>{bPending}</Text></Stack>)
}`
    const sw = transform(src, { target: 'swift' }).code
    expect(sw).toContain('@State private var __pyHook0 = PyreonFetch<Quote>()')
    expect(sw).toContain('@State private var __pyHook1 = PyreonFetch<User>()')
    expect(sw).toContain('__pyHook0.isPending')
    expect(sw).toContain('__pyHook1.isPending')
  })

  it('rest-element pattern falls through to warn-drop (no half-lowering)', () => {
    const src = `import { Stack, Text } from '@pyreon/primitives'
type Quote = { text: string }
function App() {
  const { data, ...rest } = useFetch<Quote>('https://api/q')
  return (<Stack><Text>{data()}</Text></Stack>)
}`
    const res = transform(src, { target: 'swift' })
    // no synthetic container emitted
    expect(res.code).not.toContain('__pyHook0')
    // a warning names the unsupported shape
    expect(res.warnings.some((w) => w.includes('useFetch') && w.includes('destructure'))).toBe(true)
  })

  it('single-binding form still works (no regression)', () => {
    const sw = transform(
      `import { Stack, Text } from '@pyreon/primitives'
type Quote = { text: string }
function App() {
  const q = useFetch<Quote>('https://api/q')
  return (<Stack><Text>{q.isPending}</Text></Stack>)
}`,
      { target: 'swift' },
    ).code
    expect(sw).toContain('@State private var q = PyreonFetch<Quote>()')
    expect(sw).toContain('q.isPending')
  })

  it.skipIf(!isSwiftcAvailable())('Swift: destructured useFetch typechecks via swiftc', () => {
    const out = transform(fetchApp(`const { data, isPending, error } = useFetch<Quote>('https://api/q')`), {
      target: 'swift',
    }).code
    const res = validateSwift(out)
    expect(res.ok, res.error ?? '').toBe(true)
  })

  it.skipIf(!isKotlincAvailable())('Kotlin: destructured useFetch typechecks via kotlinc', () => {
    const out = transform(fetchApp(`const { data, isPending, error } = useFetch<Quote>('https://api/q')`), {
      target: 'kotlin',
    }).code
    const res = validateKotlin(out)
    expect(res.ok, res.error ?? '').toBe(true)
  })
})
