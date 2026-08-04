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
// lifecycle auto-start for geolocation (rememberPyreonGeolocation) and push
// (.onAppear { push.start() } / rememberPyreonPushNotifications — see
// native-usepush.test.ts) has since shipped; websocket.connect-on-mount
// remains a documented follow-up.
// `useSecureStorage` lowers on both targets (Keychain / Keystore defaults) —
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
    // Swift needs no Context — Foundation resolves Application Support
    // unaided, so the no-arg initialiser is the PERSISTENT one there.
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
    // Geolocation lowers to the SELF-INSTALLING composable (mirrors
    // rememberPyreonStorage): the prior bare `remember { PyreonGeolocation() }`
    // compiled green while `geo.start()` errored on every real device —
    // nothing ever installed AndroidLocationSource.
    expect(out).toContain('val loc = rememberPyreonGeolocation()')
    expect(out).toContain('val ws = remember { PyreonWebSocket() }')
    // Context-threaded, NOT bare: `PyreonDatabase()` resolved to the
    // in-memory backend, so a `useDatabase()` app silently lost every record
    // on relaunch. Android needs a Context to find app-private storage.
    expect(out).toContain('val dbCtx = LocalContext.current')
    expect(out).toContain('val db = remember { PyreonDatabase(dbCtx) }')
    // Push lowers to the SELF-INSTALLING composable (mirrors
    // rememberPyreonNetworkStatus): the prior bare
    // `remember { PyreonPushNotifications() }` compiled green while the
    // container rendered its initial state forever — nothing wired the
    // start(register) seam, the same never-wired class.
    expect(out).toContain('val push = rememberPyreonPushNotifications()')
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
    // The invariant is the BARE read: Swift's @Observable needs no `.value`
    // suffix, unlike Kotlin's MutableState. That still holds.
    //
    // The assertion used to be `toContain('\\(loc.latitude)')` — the RAW
    // interpolation — which quietly encoded a rendering bug: `latitude` is
    // `Double?`, and Swift renders an interpolated Optional as
    // `Optional(37.3349)` where web renders `37.3349`. The emit now wraps it
    // (`\\((loc.latitude).map { "\\($0)" } ?? "")`), so the field is still read
    // bare — only the interpolation around it changed.
    expect(out).toContain('loc.latitude')
    expect(out).not.toContain('loc.latitude.value')
    expect(out).not.toContain('.value')
    // Guard the correction itself: the raw form must NOT come back.
    expect(out).not.toContain('"\\(loc.latitude)"')
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

  it('useSecureStorage lowers on Kotlin — Context-threaded Keystore default (the deferral is closed)', () => {
    // The v1 warn-drop's stated blocker ("Kotlin has no auto-constructible
    // backend") was resolved by KeystoreSecureBackend(context); the emit is
    // the PyreonDatabase(context) shape.
    const r = transform(
      wrap(`  const vault = useSecureStorage()
  return (<Stack><Text>hi</Text></Stack>)`),
      { target: 'kotlin' },
    )
    expect(r.warnings.some((w) => w.includes('useSecureStorage'))).toBe(false)
    expect(r.code).toContain('val vaultCtx = LocalContext.current')
    expect(r.code).toContain('val vault = remember { PyreonSecureStorage(vaultCtx) }')
  })

  it('useSecureStorage lowers on Swift — Keychain default + KEY-FIRST labelled calls', () => {
    const r = transform(
      wrap(`  const vault = useSecureStorage()
  const save = () => { vault.write('auth', 'tok') }
  const clear = () => { vault.remove('auth') }
  return (<Stack><Text>{vault.read('auth') ?? ''}</Text></Stack>)`),
      { target: 'swift' },
    )
    expect(r.warnings.some((w) => w.includes('useSecureStorage'))).toBe(false)
    expect(r.code).toContain('@State private var vault = PyreonSecureStorage()')
    // The labels are the load-bearing half: write's two parameters are both
    // String, so a positional emit would COMPILE with the arguments crossed
    // and store the secret under the wrong key.
    expect(r.code).toContain('vault.write(key: "auth", value: "tok")')
    expect(r.code).toContain('vault.read(key: "auth")')
    expect(r.code).toContain('vault.remove(key: "auth")')
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

  // The archetype's `interface User { … }` is now SYNTHESIZED into a struct /
  // data class by the emit itself (parse.ts:tryStructFromInterface), so the emit
  // is self-sufficient — no manual `User` prepend (which would now REDECLARE it).
  it.skipIf(!isSwiftcAvailable())('archetype emits Swift that parses on real swiftc', () => {
    const out = transform(ARCHETYPE, { target: 'swift' }).code
    const r = validateSwift('import SwiftUI\n' + out)
    if (!r.ok) throw new Error(`swiftc rejected:\n${r.error}\n---\n${out}`)
    expect(r.ok).toBe(true)
  })

  it.skipIf(!isKotlincAvailable())('archetype emits Kotlin that compiles on real kotlinc', () => {
    const out = transform(ARCHETYPE, { target: 'kotlin' }).code
    const r = validateKotlin(out)
    if (!r.ok) throw new Error(`kotlinc rejected:\n${r.error}\n---\n${out}`)
    expect(r.ok).toBe(true)
  })
})

// ── useFieldArray — the dynamic form-list container (PyreonFieldArray on
//    both targets). The load-bearing specs are the ACCESSOR UNWRAPS: on web
//    `items`/`length`/`value` are signal CALLS, natively they are
//    PROPERTIES — an emit that keeps the parens fails both toolchains
//    ("cannot call value of non-function type").
describe('useFieldArray lowering', () => {
  const APP = `import { useFieldArray } from '@pyreon/form'
import { Button, Stack, Text, For } from '@pyreon/primitives'
export function TagsDemo() {
  const tags = useFieldArray(['alpha'])
  return (
    <Stack data-testid="tags">
      <Text data-testid="tag-count">Tags: {tags.length()}</Text>
      <For each={tags.items()} by={(i) => i.key}>
        {(item) => <Text>{item.value()}</Text>}
      </For>
      <Button onPress={() => tags.append('new')} data-testid="tag-add">Add</Button>
      <Button onPress={() => tags.move(0, 1)} data-testid="tag-move">Move</Button>
    </Stack>
  )
}`

  it('Swift: decl + PROPERTY unwraps + keyed ForEach + labelled move', () => {
    const r = transform(APP, { target: 'swift' })
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('@State private var tags = PyreonFieldArray(["alpha"])')
    // Accessor unwraps — the web call parens must be GONE:
    expect(r.code).toContain('Tags: \\(tags.length)')
    expect(r.code).toContain('ForEach(tags.items, id: \\.key) { item in')
    expect(r.code).toContain('\\(item.value)')
    expect(r.code).not.toContain('tags.items()')
    expect(r.code).not.toContain('item.value()')
    // Methods stay CALLS — append positional, move labelled:
    expect(r.code).toContain('tags.append("new")')
    expect(r.code).toContain('tags.move(from: 0, to: 1)')
  })

  it('Kotlin: decl + PROPERTY unwraps + keyed items() + positional move', () => {
    const r = transform(APP, { target: 'kotlin' })
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('val tags = remember { PyreonFieldArray(listOf("alpha")) }')
    expect(r.code).toContain('Tags: ${tags.length}')
    expect(r.code).toContain('items(tags.items, key = { it.key }) { item ->')
    expect(r.code).toContain('${item.value}')
    expect(r.code).not.toContain('tags.items()')
    expect(r.code).not.toContain('item.value()')
    expect(r.code).toContain('tags.append("new")')
    expect(r.code).toContain('tags.move(0, 1)')
  })

  it('a non-literal initial warns + drops (the useWebSocket literal rule)', () => {
    const r = transform(
      wrap(`  const xs = ['a']
  const tags = useFieldArray(xs)
  return (<Stack><Text>hi</Text></Stack>)`),
      { target: 'swift' },
    )
    expect(r.warnings.some((w) => w.includes('useFieldArray initial must be an array literal'))).toBe(true)
    expect(r.code).not.toContain('PyreonFieldArray')
  })

  it('an empty call lowers to the empty container on both targets', () => {
    for (const [target, expected] of [
      ['swift', '@State private var tags = PyreonFieldArray()'],
      ['kotlin', 'val tags = remember { PyreonFieldArray() }'],
    ] as const) {
      const r = transform(
        wrap(`  const tags = useFieldArray()
  return (<Stack><Text>hi</Text></Stack>)`),
        { target },
      )
      expect(r.warnings).toEqual([])
      expect(r.code).toContain(expected)
    }
  })
})

// ── useWebSocket READ-field unwrap (Swift) — `ws.isConnected()` /
//    `ws.lastMessage()` are web signal READS; the Swift runtime declares
//    them as PROPERTIES, so a paren-keeping emit is uncompilable ("cannot
//    call value of non-function type"). Kotlin has had this unwrap since
//    the hook landed; Swift never did — invisible to the lowered-hooks
//    matrix because its usage only ever SENT.
describe('useWebSocket read-field unwrap', () => {
  const APP = `import { useWebSocket } from '@pyreon/hooks'
import { Button, Stack, Text } from '@pyreon/primitives'
export function WsDemo() {
  const ws = useWebSocket('ws://localhost:8787')
  return (
    <Stack data-testid="ws">
      <Text data-testid="ws-status">WS: {ws.isConnected() ? 'open' : 'closed'}</Text>
      <Text data-testid="ws-last">Echo: {ws.lastMessage() ?? 'none'}</Text>
      <Button onPress={() => ws.send('ping-42')} data-testid="ws-send">Send</Button>
    </Stack>
  )
}`

  it('Swift: read fields unwrap to properties; send stays a call', () => {
    const r = transform(APP, { target: 'swift' })
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('ws.isConnected ?')
    expect(r.code).toContain('ws.lastMessage ??')
    expect(r.code).not.toContain('ws.isConnected()')
    expect(r.code).not.toContain('ws.lastMessage()')
    expect(r.code).toContain('ws.send("ping-42")')
  })

  it('Kotlin: read fields keep their .value unwrap; send stays a call', () => {
    const r = transform(APP, { target: 'kotlin' })
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('ws.isConnected.value')
    expect(r.code).toContain('ws.lastMessage.value')
    expect(r.code).toContain('ws.send("ping-42")')
  })
})

// ── <Transition duration/easing> — animation CONFIG lowering (the
//    Animations row's "configurable duration/easing absent" gap). Absent
//    props must emit BYTE-IDENTICALLY to the pre-config shape (M2.7).
describe('<Transition> animation config', () => {
  const APP = (attrs: string) => `import { signal } from '@pyreon/reactivity'
import { Button, Stack, Text } from '@pyreon/primitives'
export function MotionDemo() {
  const on = signal<boolean>(true)
  return (
    <Stack>
      <Transition show={() => on()}${attrs}>
        <Text>Box</Text>
      </Transition>
    </Stack>
  )
}`

  it('Swift: duration+easing → the timing-function factory (ms → seconds)', () => {
    const r = transform(APP(' duration={2500} easing="linear"'), { target: 'swift' })
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('.animation(.linear(duration: 2.5), value: on)')
  })

  it('Swift: duration alone → easeInOut (the CSS `ease` analog)', () => {
    const r = transform(APP(' duration={800}'), { target: 'swift' })
    expect(r.code).toContain('.animation(.easeInOut(duration: 0.8), value: on)')
  })

  it('Kotlin: duration+easing → explicit fade specs with tween', () => {
    const r = transform(APP(' duration={2500} easing="linear"'), { target: 'kotlin' })
    expect(r.warnings).toEqual([])
    expect(r.code).toContain(
      'AnimatedVisibility(visible = on, enter = fadeIn(animationSpec = tween(durationMillis = 2500, easing = LinearEasing)), exit = fadeOut(animationSpec = tween(durationMillis = 2500, easing = LinearEasing)))',
    )
  })

  it('Kotlin: the four CSS easings map to the canonical Compose curves', () => {
    for (const [css, compose] of [
      ['linear', 'LinearEasing'],
      ['ease-in', 'FastOutLinearInEasing'],
      ['ease-out', 'LinearOutSlowInEasing'],
      ['ease-in-out', 'FastOutSlowInEasing'],
    ] as const) {
      const r = transform(APP(` duration={500} easing="${css}"`), { target: 'kotlin' })
      expect(r.code).toContain(compose)
    }
  })

  it('no config → BYTE-IDENTICAL default emits on both targets', () => {
    const rs = transform(APP(''), { target: 'swift' })
    expect(rs.code).toContain('.animation(.default, value: on)')
    expect(rs.code).not.toContain('duration:')
    const rk = transform(APP(''), { target: 'kotlin' })
    expect(rk.code).toContain('AnimatedVisibility(visible = on) {')
    expect(rk.code).not.toContain('tween')
  })

  it('a non-literal duration warns + falls back to the default (both targets)', () => {
    for (const target of ['swift', 'kotlin'] as const) {
      const r = transform(APP(' duration={2 * 1000}'), { target })
      expect(r.warnings.some((w) => w.includes('<Transition duration>'))).toBe(true)
    }
  })
})
