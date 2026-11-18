// `useWebSocket` follows the web hook's lifecycle on both targets.
//
// The web hook connects during setup unless `autoConnect: false`, treats a later `connect()` as a no-op while the socket
// is open, and closes the socket when the component unmounts (`onHookCleanup(close)`). The native emit used to get all
// three wrong, with no warning:
//   - ANY explicit `ws.connect()` in the component (a reconnect button) turned the mount connect OFF, so the socket stayed
//     closed until the button was pressed;
//   - `{ autoConnect: false }` was ignored — the socket connected on mount anyway;
//   - nothing closed the socket when the screen went away, so it stayed open (and kept receiving) after navigation.
// Each socket now gets a synthetic `on-mount` declaration: `connect` on mount (unless `autoConnect: false`) and `close` as
// its cleanup (Swift `.onAppear` / `.onDisappear`, Compose `LaunchedEffect` + `DisposableEffect { onDispose }`).

import { describe, expect, it } from 'vitest'
import { transform, validateKotlin } from './first-party-plugins'
import { isKotlincAvailable, isSwiftUIAvailable, validateSwift } from '../validate'

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

const LAZY = `import { useWebSocket } from '@pyreon/hooks'
import { Stack, Text, Button } from '@pyreon/primitives'
export function App() {
  const ws = useWebSocket("wss://example.com/feed", { autoConnect: false })
  return (<Stack><Text>x</Text><Button onPress={() => ws.connect()}>connect</Button></Stack>)
}`

describe('websocket lifecycle follows the web hook', () => {
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

  it('an EXPLICIT `ws.connect()` (a reconnect button) keeps the mount connect, as on the web', () => {
    const sw = transform(EXPLICIT, { target: 'swift' })
    expect(sw.warnings).toEqual([])
    expect(sw.code).toMatch(/\.onAppear \{\n\s+ws\.connect\(to: URL\(string: "wss:\/\/example\.com\/feed"\)!\)/)
    const kt = transform(EXPLICIT, { target: 'kotlin' })
    expect(kt.warnings).toEqual([])
    expect(kt.code).toMatch(/LaunchedEffect\(Unit\) \{\n\s+ws\.connect\("wss:\/\/example\.com\/feed"\)/)
  })

  it('the socket closes when the component unmounts', () => {
    for (const src of [AUTO, EXPLICIT, LAZY]) {
      expect(transform(src, { target: 'swift' }).code).toMatch(/\.onDisappear \{\n\s+ws\.close\(\)/)
      expect(transform(src, { target: 'kotlin' }).code).toMatch(/DisposableEffect\(Unit\) \{\n\s+onDispose \{\n\s+ws\.close\(\)/)
    }
  })

  it('`autoConnect: false` is honoured: no mount connect, the explicit one stays', () => {
    const silent = LAZY.replace('<Button onPress={() => ws.connect()}>connect</Button>', '')
    for (const target of ['swift', 'kotlin'] as const) {
      const count = (code: string) => code.split('\n').filter((l) => l.includes('.connect(')).length
      const r = transform(LAZY, { target })
      expect(r.warnings).toEqual([])
      expect(count(r.code), target).toBe(1)
      expect(count(transform(silent, { target }).code), `${target} without a button`).toBe(0)
    }
  })

  it('an `autoConnect` that is not a boolean literal is named, and the socket connects (the web default)', () => {
    const src = LAZY.replace('{ autoConnect: false }', '{ autoConnect: lazy }').replace('export function App() {', 'const lazy = false\nexport function App() {')
    const r = transform(src, { target: 'swift' })
    expect(r.warnings.join('\n')).toContain('`autoConnect` must be a boolean literal')
    expect(r.code).toMatch(/\.onAppear \{\n\s+ws\.connect/)
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

  it.skipIf(!isSwiftUIAvailable())(
    'iOS: the auto-connect emit TYPECHECKS against real SwiftUI',
    () => {
      const r = validateSwift(transform(AUTO, { target: 'swift' }).code)
      expect(r.ok, r.error ?? '').toBe(true)
    },
  )

  it.skipIf(!isKotlincAvailable())('Android: the auto-connect emit compiles via kotlinc', () => {
    for (const src of [AUTO, LAZY]) {
      const r = validateKotlin(transform(src, { target: 'kotlin' }).code)
      expect(r.ok, r.error ?? '').toBe(true)
    }
  })

  it.skipIf(!isSwiftUIAvailable())('iOS: the autoConnect: false emit TYPECHECKS against real SwiftUI', () => {
    const r = validateSwift(transform(LAZY, { target: 'swift' }).code)
    expect(r.ok, r.error ?? '').toBe(true)
  })
})
