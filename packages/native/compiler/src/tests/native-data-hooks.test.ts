// Phase 5 — native data/services hook emit.
//
// The runtime service containers (PyreonGeolocation / PyreonWebSocket /
// PyreonDatabase / PyreonPushNotifications / PyreonPayments / PyreonMapState /
// PyreonAuth) shipped this arc; this phase wires the compiler emit so a
// `.tsx` calling `useGeolocation()` / `useWebSocket(url)` / `useDatabase()` /
// `usePush()` / `usePayments()` / `useMap()` / `useAuth<User>()` emits the
// native container instantiation + reactive-field reads on BOTH targets:
//
//   Swift  → @State private var x = PyreonX()        (reads bare — @Observable)
//   Kotlin → val x = remember { PyreonX() }          (MutableState reads → .value)
//
// Mirrors the useOnline / usePermissions reactive-container template. The
// lifecycle auto-start (geolocation.start / websocket.connect / push.start on
// mount) is a documented follow-up — the binding + reactive reads ship now.
// `useSecureStorage` is deferred (Kotlin needs an app-injected backend) —
// it warns + drops.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import { isSwiftcAvailable, isKotlincAvailable, validateSwift, validateKotlin } from '../validate'

const wrap = (body: string) =>
  `import { Stack, Text } from '@pyreon/primitives'\ninterface User { id: string; name: string }\nfunction App() {\n${body}\n}`

describe('Phase 5 — native data/services hook emit', () => {
  it('Swift: each hook emits an @State container instantiation', () => {
    const out = transform(
      wrap(`  const loc = useGeolocation()
  const ws = useWebSocket('wss://api/feed')
  const db = useDatabase()
  const push = usePush()
  const pay = usePayments()
  const map = useMap()
  const auth = useAuth<User>()
  return (<Stack><Text>{loc.latitude}</Text></Stack>)`),
      { target: 'swift' },
    ).code
    expect(out).toContain('@State private var loc = PyreonGeolocation()')
    expect(out).toContain('@State private var ws = PyreonWebSocket()')
    expect(out).toContain('@State private var db = PyreonDatabase()')
    expect(out).toContain('@State private var push = PyreonPushNotifications()')
    expect(out).toContain('@State private var pay = PyreonPayments()')
    expect(out).toContain('@State private var map = PyreonMapState()')
    expect(out).toContain('@State private var auth = PyreonAuth<User>()')
  })

  it('Kotlin: each hook emits a remembered container', () => {
    const out = transform(
      wrap(`  const loc = useGeolocation()
  const ws = useWebSocket('wss://api/feed')
  const db = useDatabase()
  const push = usePush()
  const pay = usePayments()
  const map = useMap()
  const auth = useAuth<User>()
  return (<Stack><Text>{loc.latitude}</Text></Stack>)`),
      { target: 'kotlin' },
    ).code
    expect(out).toContain('val loc = remember { PyreonGeolocation() }')
    expect(out).toContain('val ws = remember { PyreonWebSocket() }')
    expect(out).toContain('val db = remember { PyreonDatabase() }')
    expect(out).toContain('val push = remember { PyreonPushNotifications() }')
    expect(out).toContain('val pay = remember { PyreonPayments() }')
    expect(out).toContain('val map = remember { PyreonMapState() }')
    expect(out).toContain('val auth = remember { PyreonAuth<User>() }')
  })

  it('Kotlin: MutableState fields read `.value`; Bool getters read bare', () => {
    const out = transform(
      wrap(`  const loc = useGeolocation()
  const auth = useAuth<User>()
  return (<Stack>
    <Text>{loc.latitude}</Text>
    <Text>{loc.isAuthorized}</Text>
    <Text>{auth.status}</Text>
    <Text>{auth.isAuthenticated}</Text>
  </Stack>)`),
      { target: 'kotlin' },
    ).code
    // MutableState fields → .value
    expect(out).toContain('loc.latitude.value')
    expect(out).toContain('loc.isAuthorized.value')
    expect(out).toContain('auth.status.value')
    // Bool getter → bare (NO .value)
    expect(out).toContain('auth.isAuthenticated')
    expect(out).not.toContain('auth.isAuthenticated.value')
  })

  it('Swift: reactive fields read bare (@Observable — no .value rewrite)', () => {
    const out = transform(
      wrap(`  const loc = useGeolocation()
  return (<Stack><Text>{loc.latitude}</Text></Stack>)`),
      { target: 'swift' },
    ).code
    expect(out).toContain('\\(loc.latitude)')
    expect(out).not.toContain('.value')
  })

  it('useWebSocket requires a string-literal URL (non-literal bails with a warning)', () => {
    const r = transform(
      wrap(`  const u = 'wss://x'
  const ws = useWebSocket(u)
  return (<Stack><Text>hi</Text></Stack>)`),
      { target: 'swift' },
    )
    expect(r.warnings.some((w) => w.includes('useWebSocket url argument must be a string literal'))).toBe(true)
    expect(r.code).not.toContain('PyreonWebSocket()')
  })

  it('useSecureStorage is deferred — warns + drops (no emit)', () => {
    const r = transform(
      wrap(`  const vault = useSecureStorage()
  return (<Stack><Text>hi</Text></Stack>)`),
      { target: 'kotlin' },
    )
    expect(r.warnings.some((w) => w.includes('useSecureStorage') && w.includes('deferred'))).toBe(true)
    expect(r.code).not.toContain('PyreonSecureStorage')
  })

  // ── Archetype proof: a realistic finance + realtime/maps component emits
  //    typecheck-clean Swift + Kotlin from ONE source. The "can we build the
  //    apps" claim, at the compile rung. ──

  const ARCHETYPE = `import { Stack, Inline, Text, Button } from '@pyreon/primitives'
interface User { id: string; name: string }
function FinanceRealtimeApp() {
  const auth = useAuth<User>()
  const db = useDatabase()
  const ws = useWebSocket('wss://api/ticks')
  const loc = useGeolocation()
  const map = useMap()
  const pay = usePayments()
  const push = usePush()
  return (<Stack>
    <Text>{auth.isAuthenticated}</Text>
    <Text>{ws.lastMessage}</Text>
    <Text>{ws.isConnected}</Text>
    <Text>{loc.latitude}</Text>
    <Text>{loc.longitude}</Text>
    <Text>{map.selectedMarkerId}</Text>
    <Text>{pay.purchasing}</Text>
    <Text>{push.token}</Text>
  </Stack>)
}`

  it.skipIf(!isSwiftcAvailable())('archetype emits Swift that parses on real swiftc', () => {
    const out = transform(ARCHETYPE, { target: 'swift' }).code
    const r = validateSwift(
      'import SwiftUI\nstruct User { let id: String; let name: String }\n' + out,
    )
    if (!r.ok) throw new Error(`swiftc rejected:\n${r.error}\n---\n${out}`)
    expect(r.ok).toBe(true)
  })

  it.skipIf(!isKotlincAvailable())('archetype emits Kotlin that compiles on real kotlinc', () => {
    const out = transform(ARCHETYPE, { target: 'kotlin' }).code
    const r = validateKotlin('class User(val id: String, val name: String)\n' + out)
    if (!r.ok) throw new Error(`kotlinc rejected:\n${r.error}\n---\n${out}`)
    expect(r.ok).toBe(true)
  })
})
