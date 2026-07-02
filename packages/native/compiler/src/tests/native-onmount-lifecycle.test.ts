// P2 lifecycle foundation — `onMount(fn)` lowering + the Swift
// `ws.connect()` url-threading (both targets).
//
// THE documented lifecycle escape hatch ("call .start()/.connect() from an
// onMount/effect" — multiplatform.md, the Phase-5 hook contract) was a
// SILENT drop: the component-body walker only handled declarations +
// return, so `onMount(() => ws.connect())` compiled clean with ZERO
// warnings and did NOTHING on device. Worst class: silent + documented.
//
// Lowering:
//   Swift  → `.onAppear { <body> }` chained on the STABLE-IDENTITY host
//            (the fetch-arc ZStack — a transparent Group redistributes the
//            modifier onto conditional branches and re-fires it per flip;
//            the same device-found class as `.task`).
//   Kotlin → `LaunchedEffect(Unit) { <body> }` (run-once-on-mount, keyed
//            by the stable Unit).
// Companions:
//   - `ws.connect()` (0-arg TS surface; useWebSocket(url) carries the url)
//     lowers on Swift to the runtime's `connect(to: URL(string: …)!)`.
//     On Kotlin it CANNOT lower (the runtime's connect takes a
//     HOST-SUPPLIED transport lambda) → NAMED warning + raw emit (kotlinc
//     rejects it loud — the stub mirrors the real surface).
//   - A returned CLEANUP fn → NAMED warning, mount body still emitted.
//   - Any OTHER bare expression statement (bare `effect(...)`, stray
//     calls) → NAMED drop warning — closing the whole silent class.
//
// Bisect-load-bearing: (1) neuter the parse onMount branch → everything
// falls to the bare-statement warning + no harness on either target;
// (2) neuter the Swift .onAppear loop → the Swift harness specs fail while
// Kotlin passes; (3) neuter the Kotlin LaunchedEffect loop → the mirror;
// (4) neuter the Swift connect lowering → the url-threading spec fails.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import {
  isKotlincAvailable,
  isSwiftUIAvailable,
  validateKotlin,
  validateSwiftTypecheck,
} from '../validate'

const WS = `import { signal, onMount } from '@pyreon/reactivity'
import { useWebSocket } from '@pyreon/hooks'
import { Stack, Text } from '@pyreon/primitives'
export function App(){
  const ws = useWebSocket('wss://example.com/feed')
  onMount(() => { ws.connect() })
  return (<Stack><Text>{ws.lastMessage() ?? ""}</Text></Stack>)
}`

const SIG = `import { signal, onMount } from '@pyreon/reactivity'
import { Stack, Text } from '@pyreon/primitives'
export function App(){
  const count = signal<number>(0)
  onMount(() => { count.set(5) })
  return (<Stack><Text>{String(count())}</Text></Stack>)
}`

describe('P2 — onMount lifecycle lowering (both targets)', () => {
  it('Swift: onMount lowers to .onAppear on the stable-identity ZStack host', () => {
    const rs = transform(SIG, { target: 'swift' })
    expect(rs.code).toContain('.onAppear {')
    expect(rs.code).toContain('ZStack {')
    expect(rs.code).toContain('count = 5')
    expect(rs.warnings).toHaveLength(0)
  })
  it('Kotlin: onMount lowers to LaunchedEffect(Unit)', () => {
    const rk = transform(SIG, { target: 'kotlin' })
    expect(rk.code).toContain('LaunchedEffect(Unit) {')
    expect(rk.code).toContain('count = 5')
    expect(rk.warnings).toHaveLength(0)
  })
  it('Swift: `ws.connect()` threads the decl url → `connect(to: URL(string: …)!)`', () => {
    const rs = transform(WS, { target: 'swift' })
    expect(rs.code).toContain('ws.connect(to: URL(string: "wss://example.com/feed")!)')
    expect(rs.warnings).toHaveLength(0)
  })
  it('Kotlin: `ws.connect()` warns NAMED (host transport required) + keeps the loud raw emit', () => {
    const rk = transform(WS, { target: 'kotlin' })
    expect(rk.warnings.some((w) => w.includes('ws.connect()'))).toBe(true)
    expect(rk.code).toContain('LaunchedEffect(Unit) {')
    expect(rk.code).toContain('ws.connect()')
  })

  it('guard: a returned cleanup fn warns NAMED; the mount body is still emitted', () => {
    const rc = transform(
      `import { signal, onMount } from '@pyreon/reactivity'
import { Stack, Text } from '@pyreon/primitives'
export function App(){
  const count = signal<number>(0)
  onMount(() => { count.set(5); return () => count.set(0) })
  return (<Stack><Text>{String(count())}</Text></Stack>)
}`,
      { target: 'swift' },
    )
    expect(rc.warnings.some((w) => w.includes('cleanup'))).toBe(true)
    expect(rc.code).toContain('count = 5')
    expect(rc.code).not.toContain('return {')
  })
  it('guard: a bare `effect(...)` statement warns NAMED (the silent-drop class is closed)', () => {
    const re = transform(
      `import { signal, effect } from '@pyreon/reactivity'
import { Stack, Text } from '@pyreon/primitives'
export function App(){
  const count = signal<number>(0)
  effect(() => { console.log(count()) })
  return (<Stack><Text>{String(count())}</Text></Stack>)
}`,
      { target: 'swift' },
    )
    expect(re.warnings.some((w) => w.includes('effect(...)'))).toBe(true)
  })
  it('guard: a bare `void x` reference no-op does NOT warn (rx-full regression)', () => {
    // The bare-statement walker must warn ONLY on genuine dropped CALLS
    // (`effect(...)`), never on non-call expression statements — `void x`
    // reference no-ops (used in fixtures to mark computeds as read) carry
    // no side effect and were silently dropped before this walker existed.
    // Warning on them was an over-eager regression that broke the
    // native-cli build test on rx-full.tsx (20 `void` refs → 20 warnings).
    const re = transform(
      `import { signal, computed } from '@pyreon/reactivity'
import { Stack, Text } from '@pyreon/primitives'
export function App(){
  const count = signal<number>(0)
  const doubled = computed(() => count() * 2)
  void doubled
  void count
  return (<Stack><Text>{String(count())}</Text></Stack>)
}`,
      { target: 'swift' },
    )
    expect(re.warnings.some((w) => w.includes('bare component-body statement'))).toBe(false)
  })

  // Compile proofs — the pure-signal onMount body typechecks end-to-end
  // (websocket components need the PyreonRuntime module — device-gate scope).
  it.skipIf(!isSwiftUIAvailable())('iOS: the onMount component TYPECHECKS against real SwiftUI', () => {
    const r = validateSwiftTypecheck(transform(SIG, { target: 'swift' }).code)
    expect(r.ok, r.error ?? '').toBe(true)
  })
  it.skipIf(!isKotlincAvailable())('Android: the same compiles via kotlinc', () => {
    const r = validateKotlin(transform(SIG, { target: 'kotlin' }).code)
    expect(r.ok, r.error ?? '').toBe(true)
  })
})
