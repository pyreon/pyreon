// WebSocket auto-connect-on-mount synthesis (lifecycle auto-start, part B).
// The web `useWebSocket(url)` hook auto-connects on mount; on native the
// binding (`PyreonWebSocket()`) was created but never connected unless the
// developer wrote an explicit `onMount(() => ws.connect())`. This synthesizes
// that implicit connect: for a websocket decl with NO explicit `.connect()`,
// an on-mount decl is appended, which the #1986 mount harness emits (Swift
// `.onAppear` on the stable host / Kotlin `LaunchedEffect(Unit)`) and the
// connect url-threading lowers to the faithful `connect(to: URL(...))` /
// `connect(url)`. A decl that already has an explicit `.connect()` is skipped
// (no double-connect).

import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import {
  isKotlincAvailable,
  isSwiftUIAvailable,
  validateKotlin,
  validateSwift,
} from '../validate'

const AUTO = `import { useWebSocket } from '@pyreon/hooks'
import { Stack, Text, Button } from '@pyreon/primitives'
export function App() {
  const ws = useWebSocket("wss://example.com/feed")
  return (<Stack><Text>x</Text><Button onPress={() => ws.send("ping")}>ping</Button></Stack>)
}`

const EXPLICIT = `import { useWebSocket } from '@pyreon/hooks'
import { Stack, Text, Button } from '@pyreon/primitives'
export function App() {
  const ws = useWebSocket("wss://example.com/feed")
  return (<Stack><Text>x</Text><Button onPress={() => ws.connect()}>connect</Button></Stack>)
}`

describe('websocket auto-connect-on-mount synthesis', () => {
  it('Swift: no explicit connect → `.onAppear { ws.connect(to: URL(...)) }`', () => {
    const out = transform(AUTO, { target: 'swift' })
    expect(out.code).toContain('.onAppear {')
    expect(out.code).toContain('ws.connect(to: URL(string: "wss://example.com/feed")!)')
    expect(out.warnings).toHaveLength(0)
  })

  it('Kotlin: no explicit connect → `LaunchedEffect(Unit) { ws.connect("…") }`', () => {
    const out = transform(AUTO, { target: 'kotlin' })
    expect(out.code).toContain('LaunchedEffect(Unit) {')
    expect(out.code).toContain('ws.connect("wss://example.com/feed")')
    expect(out.warnings).toHaveLength(0)
  })

  it('an EXPLICIT `ws.connect()` does NOT get an auto-synthesized second connect', () => {
    // exactly one connect (the explicit one, in the handler), no mount harness.
    for (const target of ['swift', 'kotlin'] as const) {
      const code = transform(EXPLICIT, { target }).code
      const connects = code.split('\n').filter((l) => l.includes('.connect(')).length
      expect(connects).toBe(1)
      const mount = code.includes('.onAppear {') || code.includes('LaunchedEffect(Unit) {')
      expect(mount).toBe(false)
    }
  })

  it('a component with no websocket decl is unchanged (no spurious mount harness)', () => {
    const src = `import { signal } from '@pyreon/reactivity'
import { Stack, Text } from '@pyreon/primitives'
export function App() {
  const n = signal(0)
  return (<Stack><Text>{String(n())}</Text></Stack>)
}`
    const sw = transform(src, { target: 'swift' }).code
    expect(sw).not.toContain('.onAppear {')
    const kt = transform(src, { target: 'kotlin' }).code
    expect(kt).not.toContain('LaunchedEffect(Unit) {')
  })

  it.skipIf(!isSwiftUIAvailable())('iOS: the auto-connect emit TYPECHECKS against real SwiftUI', () => {
    const r = validateSwift(transform(AUTO, { target: 'swift' }).code)
    expect(r.ok, r.error ?? '').toBe(true)
  })

  it.skipIf(!isKotlincAvailable())('Android: the auto-connect emit compiles via kotlinc', () => {
    const r = validateKotlin(transform(AUTO, { target: 'kotlin' }).code)
    expect(r.ok, r.error ?? '').toBe(true)
  })
})
