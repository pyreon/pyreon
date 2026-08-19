/**
 * Unit tests for the native lifecycle-wiring gate's PURE logic.
 *
 * The gate closes the "never-wired class": a reactive native container whose
 * start()/connect() is not auto-started ships FROZEN at its initial value
 * (useOnline true, usePush, useAppState — all shipped this way). These specs
 * exercise the discover/verify functions with synthetic inputs, and the
 * bisect-style specs prove the gate FAILS on the exact regressions it exists
 * to catch (an unclassified container; a deleted AUTO wiring).
 */
import { describe, expect, it } from 'vitest'
import {
  discoverLifecycleContainers,
  LIFECYCLE_REGISTRY,
  verifyLifecycleWiring,
  type NativeFile,
} from '../../../../../scripts/check-native-lifecycle-wiring'

const swiftFile = (name: string, verb: 'start' | 'connect' | 'begin'): NativeFile => ({
  path: `packages/fundamentals/hooks/native/swift/${name}.swift`,
  text: `public final class ${name} {\n  public func ${verb}() {}\n}\n`,
})

describe('discoverLifecycleContainers', () => {
  it('finds containers exposing start()/connect(), keyed by class name', () => {
    const d = discoverLifecycleContainers([
      swiftFile('PyreonNetworkStatus', 'start'),
      swiftFile('PyreonWebSocket', 'connect'),
    ])
    expect([...d.keys()].sort()).toEqual(['PyreonNetworkStatus', 'PyreonWebSocket'])
    expect(d.get('PyreonNetworkStatus')!.method).toBe('start')
    expect(d.get('PyreonWebSocket')!.method).toBe('connect')
  })

  it('does NOT match the begin() recorder/sensor idiom (out of the auto-start class)', () => {
    const d = discoverLifecycleContainers([swiftFile('PyreonAudioRecorder', 'begin')])
    expect(d.size).toBe(0)
  })

  it('dedupes an Android/OkHttp companion onto its base class', () => {
    const d = discoverLifecycleContainers([
      { path: 'a/PyreonWebSocket.kt', text: 'class PyreonWebSocket { fun connect() {} }' },
      { path: 'a/PyreonWebSocketOkHttp.kt', text: 'class PyreonWebSocketOkHttp { fun connect() {} }' },
    ])
    expect([...d.keys()]).toEqual(['PyreonWebSocket'])
  })
})

describe('verifyLifecycleWiring', () => {
  const emits = { swift: `'network-status' 'app-state' 'push' 'crash-reporter' 'websocket'`, kotlin: `'network-status' 'app-state' 'push' 'crash-reporter' 'websocket'` }

  it('passes when every discovered container is classified + AUTO ones are wired', () => {
    // A minimal registry matching the discovered subset — one AUTO (wired) + one
    // MANUAL (with rationale) — so registry-stale does not fire on absent siblings.
    const reg = [
      { container: 'PyreonNetworkStatus', method: 'start' as const, policy: 'auto' as const, declKind: 'network-status' },
      { container: 'PyreonGeolocation', method: 'start' as const, policy: 'manual' as const, why: 'permission-gated opt-in' },
    ]
    const discovered = discoverLifecycleContainers([
      swiftFile('PyreonNetworkStatus', 'start'),
      swiftFile('PyreonGeolocation', 'start'),
    ])
    expect(verifyLifecycleWiring(discovered, reg, emits)).toEqual([])
  })

  // BISECT 1 — a NEW reactive container that nobody classified is exactly the
  // useOnline/usePush/useAppState regression. The gate must red on it.
  it('FAILS (unclassified) on a new start() container missing from the registry', () => {
    const discovered = discoverLifecycleContainers([swiftFile('PyreonHeartRate', 'start')])
    const problems = verifyLifecycleWiring(discovered, LIFECYCLE_REGISTRY, emits)
    expect(problems.some((p) => p.kind === 'unclassified' && p.container === 'PyreonHeartRate')).toBe(true)
  })

  // BISECT 2 — deleting an AUTO container's emit wiring (the useOnline shape)
  // must red, per platform.
  it('FAILS (auto-not-wired) when an AUTO decl kind is absent from an emit', () => {
    const discovered = discoverLifecycleContainers([swiftFile('PyreonNetworkStatus', 'start')])
    const brokenSwift = { swift: `'app-state' 'push'`, kotlin: emits.kotlin } // network-status wiring deleted
    const problems = verifyLifecycleWiring(discovered, LIFECYCLE_REGISTRY, brokenSwift)
    expect(
      problems.some((p) => p.kind === 'auto-not-wired' && p.container === 'PyreonNetworkStatus'),
    ).toBe(true)
  })

  it('FAILS (registry-stale) when a registered container no longer exists', () => {
    const discovered = discoverLifecycleContainers([swiftFile('PyreonNetworkStatus', 'start')])
    // registry lists PyreonWebSocket etc., none of which are in `discovered`
    const problems = verifyLifecycleWiring(discovered, LIFECYCLE_REGISTRY, emits)
    expect(problems.some((p) => p.kind === 'registry-stale' && p.container === 'PyreonWebSocket')).toBe(true)
  })

  it('FAILS (manual-no-rationale) when a MANUAL entry has an empty why', () => {
    const discovered = discoverLifecycleContainers([swiftFile('PyreonGeolocation', 'start')])
    const reg = LIFECYCLE_REGISTRY.map((e) =>
      e.container === 'PyreonGeolocation' ? { ...e, why: '' } : e,
    )
    const problems = verifyLifecycleWiring(discovered, reg, emits)
    expect(
      problems.some((p) => p.kind === 'manual-no-rationale' && p.container === 'PyreonGeolocation'),
    ).toBe(true)
  })
})

describe('the real registry is internally consistent', () => {
  it('every AUTO entry has a declKind; every MANUAL entry has a rationale', () => {
    for (const e of LIFECYCLE_REGISTRY) {
      if (e.policy === 'auto') expect(e.declKind, `${e.container} AUTO needs a declKind`).toBeTruthy()
      else expect(e.why?.trim(), `${e.container} MANUAL needs a why`).toBeTruthy()
    }
  })
})
