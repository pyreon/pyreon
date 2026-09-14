// Coverage: the last Kotlin-backend arms — the LOCAL-shadow restores in
// `emitKotlinExpr`'s lambda/range paths and `emitKotlinFunction`'s params,
// the nested-route layout scan, a non-object `db.insert` fields argument,
// useDeviceMotion's reads, and the 0-param block lambda.
//
// The shadow restores are the reason this file exists: the emit registers a
// lambda/range/function param in the SHARED inference context so the body
// types, and must put the OUTER binding back on the way out. That is the
// "save-then-RESTORE, never reset-to-a-constant" rule, and the failure is
// silent — a later expression typed by a dead parameter.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'

const kt = (src: string) => transform(src, { target: 'kotlin' })

describe('Kotlin: a lambda / range param that SHADOWS a function-body local', () => {
  it('restores the outer local afterwards, so a later read keeps its own type', () => {
    const out = kt(`import { Stack, Text, Press } from '@pyreon/primitives'
import { signal } from '@pyreon/reactivity'
export function App() {
  const xs = signal<number[]>([1])
  const run = () => {
    const i = 'outer'
    const a = Array.from({ length: 3 }, (_, i) => i * 2)
    const b = xs().map((i) => i)
    xs.set([a.length, b.length, i.length])
  }
  return (<Stack><Press onPress={run}><Text>{String(xs().length)}</Text></Press></Stack>)
}`).code
    expect(out).toContain('val i = "outer"')
    expect(out).toContain('(0 until 3).map({ i -> i * 2 })')
    // `i.length` after both shadows unwind still resolves against the String
    expect(out).toContain('i.length')
  })

  it('a top-level function PARAM shadowing an earlier body local is restored too', () => {
    const out = kt(`import { Stack, Text } from '@pyreon/primitives'
import { signal } from '@pyreon/reactivity'
function outer(v: number): number {
  const w = 1
  return v + w
}
function inner(w: string): number { return w.length }
export function App() { const q = signal<number>(1); return (<Stack><Text>{String(outer(q()) + inner('a'))}</Text></Stack>) }`).code
    expect(out).toContain('fun inner(w: String): Int = w.length')
    expect(out).toContain('fun outer(v: Int): Int {')
  })
})

describe('Kotlin: useDeviceMotion reads', () => {
  it('`supported` is a plain getter; active/acceleration/rotation are MutableState', () => {
    const out = kt(`import { useDeviceMotion } from '@pyreon/hooks'
import { Stack, Text } from '@pyreon/primitives'
export function P() {
  const m = useDeviceMotion()
  return (<Stack><Text>{String(m.active()) + String(m.supported()) + String(m.acceleration())}</Text></Stack>)
}`).code
    expect(out).toContain('m.active.value')
    expect(out).toContain('m.acceleration.value')
    expect(out).toContain('(m.supported).toString()')
    expect(out).not.toContain('m.supported.value')
  })
})

describe('Kotlin: db.insert with a non-literal `fields` argument', () => {
  it('forwards the expression as written rather than trying to build a map from it', () => {
    const out = kt(`import { useDatabase } from '@pyreon/storage'
import { Stack, Text, Press } from '@pyreon/primitives'
export function App() {
  const db = useDatabase('app')
  const f: Record<string, string> = { at: 'x' }
  const add = () => { db.insert('notes', { id: 'n1', fields: f }) }
  return (<Stack><Press onPress={add}><Text>go</Text></Press></Stack>)
}`).code
    expect(out).toContain('db.insert("notes", PyreonRecord("n1", f))')
  })
})

describe('Kotlin: a ZERO-param block lambda emits no binder head', () => {
  it('`() => { … }` passed as a callback keeps its statements and no `->`', () => {
    const out = kt(`import { Stack, Text, Press } from '@pyreon/primitives'
import { signal } from '@pyreon/reactivity'
export function App() {
  const n = signal<number>(0)
  const later = (cb: () => void) => { cb() }
  const run = () => { later(() => { const z = 2; n.set(z) }) }
  return (<Stack><Press onPress={run}><Text>{String(n())}</Text></Press></Stack>)
}`).code
    expect(out).toContain('val z = 2')
    expect(out).not.toContain('-> Unit }')
  })
})

describe('Kotlin: a union of ONLY nullish branches', () => {
  it('renders as `Any?` rather than a bare `Any`', () => {
    const out = kt(`import { Stack, Text } from '@pyreon/primitives'
import { signal } from '@pyreon/reactivity'
export function App() {
  const z = signal<null | undefined>(null)
  return (<Stack><Text>{String(z())}</Text></Stack>)
}`).code
    expect(out).toContain('mutableStateOf<Any?>(null)')
  })
})

describe('Kotlin: nested routes register the layout component', () => {
  it('a layout named by an identifier becomes a content-slot composable', () => {
    const out = kt(`import { createRouter, RouterProvider, RouterView } from '@pyreon/router'
import { Stack, Text } from '@pyreon/primitives'
function AppLayout() { return (<Stack><Text>chrome</Text><RouterView /></Stack>) }
function Dashboard() { return (<Stack><Text>dash</Text></Stack>) }
export function App() {
  const router = createRouter({ routes: [
    { path: '/app', component: AppLayout, children: [
      { path: 'dashboard', component: Dashboard },
    ] },
  ] })
  return (<RouterProvider router={router}><RouterView /></RouterProvider>)
}`).code
    // the layout takes the child slot rather than rendering a second router view
    expect(out).toContain('fun AppLayout(')
    expect(out).toContain('Dashboard')
  })
})

// ─────────────────────────── KNOWN BUG ───────────────────────────
//
// On KOTLIN, an array-callback param that SHADOWS an outer local is typed
// by the OUTER local rather than by the array's element type. Swift, from
// the same shared source, types it correctly — so this is a per-target
// divergence, not a shared limitation.
//
//   const i = 'outer'                       // a String local
//   const b = xs().map((i) => i + 1)        // xs: number[]
//
//   Swift  : xs.map({ i in i + 1 })                 ← correct
//   Kotlin : xs.map({ i -> i + (1).toString() })    ← string CONCAT
//
// Two failures at once. Semantically the web computes `[2]` and the Kotlin
// emit means `"12"`; and it does not even get that far —
//
//   COMPILE-PROVEN via validateKotlin on the emitted file:
//     with the outer `const i = 'outer'`   → kotlinc:
//       error: cannot infer type for type parameter 'R'. Specify it
//       explicitly.        val b = xs.map({ i -> i + (1).toString() })
//     without it                          → ok
//
// So the presence of an unrelated local, ANYWHERE earlier in the same
// function body, decides whether the file builds. The `+` coercion is a
// symptom; the cause is that the callback param is not registered with the
// element type before the body is emitted, so `inferType` falls through to
// whatever binding already holds that name.
//
// Note the range form right beside it DOES register its param (the
// `Array.from({length})` path seeds `indexParam` as a number and restores
// the previous binding), so the mechanism exists — it is the plain
// array-callback path that skips it.
//
// FIX: seed the callback params with the receiver's element type (saving +
// restoring the outer binding, as the range path does) before emitting a
// plain array-method callback body in emit-kotlin.ts.
//
// This spec passes the moment the param is typed from the element; delete
// the `.fails` then.
describe('Kotlin: an array-callback param shadowing an outer local', () => {
  it.fails('KNOWN BUG: the param is typed by the OUTER local, so the body coerces wrongly', () => {
    const src = (outer: string) => `import { Stack, Text, Press } from '@pyreon/primitives'
import { signal } from '@pyreon/reactivity'
export function App() {
  const xs = signal<number[]>([1])
  const run = () => {
    ${outer}
    const b = xs().map((i) => i + 1)
    xs.set(b)
  }
  return (<Stack><Press onPress={run}><Text>{String(xs().length)}</Text></Press></Stack>)
}`
    // the neighbouring shape — no outer binding of that name — is correct
    expect(kt(src('')).code).toContain('xs.map({ i -> i + 1 })')
    // Swift is correct with OR without the outer local
    expect(transform(src(`const i = 'outer'`), { target: 'swift' }).code).toContain(
      'xs.map({ i in i + 1 })',
    )
    expect(
      kt(src(`const i = 'outer'`)).code,
      'a String local named `i` must not retype the number[] callback param',
    ).toContain('xs.map({ i -> i + 1 })')
  })
})

describe('Kotlin: an ANNOTATED nested arrow whose param shadows an enclosing local', () => {
  it('emits the typed anonymous-function form and leaves the outer local intact', () => {
    const out = kt(`import { Stack, Text, Press } from '@pyreon/primitives'
import { signal } from '@pyreon/reactivity'
export function App() {
  const n = signal<number>(0)
  const run = () => {
    const w = 1
    const inner = (w: string): number => { const q = w.length; return q }
    n.set(inner('abc') + w)
  }
  return (<Stack><Press onPress={run}><Text>{String(n())}</Text></Press></Stack>)
}`).code
    expect(out).toContain('val inner = fun(w: String): Int {')
    expect(out).toContain('val q = w.length')
    // the outer Int `w` still adds as an Int after the String param unwinds
    expect(out).toContain('n = inner("abc") + w')
  })
})

describe('Kotlin: enum resolution in a file of pure top-level helpers', () => {
  it('a struct MEMBER read resolves its enum from the FILE-level struct table', () => {
    // No component here, so the per-component inference ctx is empty — the
    // enum can only come from the file-level struct table. Without that
    // fallback the `??` default and the comparison keep a raw String, which
    // kotlinc rejects against an `enum class`.
    const out = kt(`type Side = 'left' | 'right'
type Shape = { side: Side; n: number }
export function pick(s: Shape): Side {
  return s.side ?? 'left'
}
export function pick2(s: Shape): boolean {
  return s.side === 'left'
}`).code
    expect(out).toContain('enum class Side { left, right }')
    expect(out).toContain('fun pick(s: Shape): Side = (s.side ?: Side.left)')
    expect(out).toContain('fun pick2(s: Shape): Boolean = s.side == Side.left')
  })
})
