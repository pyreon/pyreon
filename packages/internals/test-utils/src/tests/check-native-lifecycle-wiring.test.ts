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
import { SERVICES } from '../../../../native/compiler/src/services'

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

// The Swift emit renders every descriptor lifecycle from ONE loop; this is the
// minimal text the gate recognises as that loop (and the real emit's shape).
const SWIFT_LOOP = 'for (const svc of SERVICES) { lines.push(`.onAppear { ${name}.start() }`) }'

describe('verifyLifecycleWiring', () => {
  const emits = { swift: `${SWIFT_LOOP} 'websocket'`, kotlin: `'websocket'` }

  it('passes when every discovered container is classified + AUTO ones are wired', () => {
    // A minimal registry matching the discovered subset — one AUTO (wired) + one
    // MANUAL (with rationale) — so registry-stale does not fire on absent siblings.
    const reg = [
      { container: 'PyreonNetworkStatus', method: 'start' as const, policy: 'auto' as const, hook: 'useOnline' },
      { container: 'PyreonGeolocation', method: 'start' as const, policy: 'manual' as const, why: 'permission-gated opt-in' },
    ]
    const discovered = discoverLifecycleContainers([
      swiftFile('PyreonNetworkStatus', 'start'),
      swiftFile('PyreonGeolocation', 'start'),
    ])
    // `services` is the real SERVICES table; the Online descriptor declares a
    // lifecycle, so the `lifecycle-unregistered` direction would flag the other
    // lifecycle hooks — restrict to the one under test.
    const only = SERVICES.filter((s) => s.hook === 'useOnline')
    expect(verifyLifecycleWiring(discovered, reg, emits, only)).toEqual([])
  })

  // BISECT 1 — a NEW reactive container that nobody classified is exactly the
  // useOnline/usePush/useAppState regression. The gate must red on it.
  it('FAILS (unclassified) on a new start() container missing from the registry', () => {
    const discovered = discoverLifecycleContainers([swiftFile('PyreonHeartRate', 'start')])
    const problems = verifyLifecycleWiring(discovered, LIFECYCLE_REGISTRY, emits)
    expect(problems.some((p) => p.kind === 'unclassified' && p.container === 'PyreonHeartRate')).toBe(true)
  })

  // BISECT 2 — deleting an AUTO container's emit wiring must red, per platform.
  // Hand-wired kinds (websocket) are checked by the decl-kind literal.
  it('FAILS (auto-not-wired) when a hand-wired AUTO decl kind is absent from an emit', () => {
    const discovered = discoverLifecycleContainers([swiftFile('PyreonWebSocket', 'connect')])
    const brokenSwift = { swift: SWIFT_LOOP, kotlin: emits.kotlin } // websocket wiring deleted
    const problems = verifyLifecycleWiring(discovered, LIFECYCLE_REGISTRY, brokenSwift)
    expect(
      problems.some((p) => p.kind === 'auto-not-wired' && p.container === 'PyreonWebSocket'),
    ).toBe(true)
  })

  // BISECT 3 — the descriptor-backed path. Each of the three ways the old
  // per-kind wiring could be lost must red and NAME the container.
  describe('descriptor-backed AUTO entries (services.ts `lifecycle`)', () => {
    const discovered = discoverLifecycleContainers([swiftFile('PyreonNetworkStatus', 'start')])
    const reg = LIFECYCLE_REGISTRY.filter((e) => e.container === 'PyreonNetworkStatus')
    const online = SERVICES.find((s) => s.hook === 'useOnline')!

    it('passes against the real descriptor', () => {
      expect(verifyLifecycleWiring(discovered, reg, emits, [online])).toEqual([])
    })

    it('accepts the loop over the active registry (allServices()) as well as the built-in table', () => {
      const registryLoop = SWIFT_LOOP.replace('SERVICES', 'allServices()')
      expect(
        verifyLifecycleWiring(discovered, reg, { swift: `${registryLoop} 'websocket'`, kotlin: emits.kotlin }, [online]),
      ).toEqual([])
    })

    it('FAILS when the descriptor loses its lifecycle (iOS would never start it)', () => {
      const { lifecycle: _gone, ...noLifecycle } = online
      const problems = verifyLifecycleWiring(discovered, reg, emits, [noLifecycle])
      expect(
        problems.some(
          (p) => p.kind === 'auto-not-wired' && p.container === 'PyreonNetworkStatus' && /iOS/.test(p.detail),
        ),
      ).toBe(true)
    })

    it('FAILS when the Swift emit loses the lifecycle loop', () => {
      const problems = verifyLifecycleWiring(discovered, reg, { swift: `'websocket'`, kotlin: emits.kotlin }, [online])
      expect(
        problems.some((p) => p.kind === 'auto-not-wired' && p.container === 'PyreonNetworkStatus'),
      ).toBe(true)
    })

    it('FAILS when the Kotlin line is a bare remember { } (Android would ship frozen)', () => {
      const bare = { ...online, kotlin: ['val {id} = remember { PyreonNetworkStatus() }'] }
      const problems = verifyLifecycleWiring(discovered, reg, emits, [bare])
      expect(
        problems.some(
          (p) => p.kind === 'auto-not-wired' && p.container === 'PyreonNetworkStatus' && /Android/.test(p.detail),
        ),
      ).toBe(true)
    })

    it('FAILS when the hook has no descriptor at all', () => {
      const problems = verifyLifecycleWiring(discovered, reg, emits, [])
      expect(problems.some((p) => p.kind === 'auto-not-wired' && /no descriptor/.test(p.detail))).toBe(true)
    })

    it('FAILS (lifecycle-unregistered) when a descriptor declares a lifecycle nobody classified', () => {
      const orphan = { ...online, hook: 'useHeartRate' }
      const problems = verifyLifecycleWiring(discovered, reg, emits, [online, orphan])
      expect(problems.some((p) => p.kind === 'lifecycle-unregistered' && p.container === 'useHeartRate')).toBe(true)
    })
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
  it('every AUTO entry names a hook or a declKind; every MANUAL entry has a rationale', () => {
    for (const e of LIFECYCLE_REGISTRY) {
      if (e.policy === 'auto')
        expect(e.hook ?? e.declKind, `${e.container} AUTO needs a hook or a declKind`).toBeTruthy()
      else expect(e.why?.trim(), `${e.container} MANUAL needs a why`).toBeTruthy()
    }
  })
})

describe('the real descriptors agree with the real registry', () => {
  it('every descriptor lifecycle has an AUTO registry entry for that hook, and vice versa', () => {
    const fromDescriptors = SERVICES.filter((s) => s.lifecycle !== undefined).map((s) => s.hook).sort()
    const fromRegistry = LIFECYCLE_REGISTRY.filter((e) => e.hook !== undefined).map((e) => e.hook!).sort()
    expect(fromRegistry).toEqual(fromDescriptors)
  })
})
