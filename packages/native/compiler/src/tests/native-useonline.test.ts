// Phase 4 — `useOnline()` native emit. Own test file (not
// canonical-primitives.test.ts) to avoid append-conflicts with in-flight
// emit PRs that also extend that file.
//
// THE cross-platform contract: `useOnline()` on the WEB returns an ACCESSOR
// (`() => boolean`), so ONE shared source reads it as `net()` — exactly what
// the two shipped consumers do (fundamentals-playground HooksDemo:
// `online() ? 'ONLINE' : 'OFFLINE'`; hn-clone _layout: `online() ? null : …`).
// The native emit lowers that accessor call to the connectivity container's
// reactive `isOnline` read:
//
//   const net = useOnline()        Swift  → @State private var net = PyreonNetworkStatus()
//   net()                          Swift  → net.isOnline           (@Observable Bool, read bare)
//                                  Kotlin → net.isOnline.value     (Compose MutableState<Boolean>)
//
// Before this fix, `net()` fell through the zero-arg-identifier-call handler to
// a bare `net` → `if net { }` — UNCOMPILABLE (the container is not a Bool),
// emitted with ZERO warnings. So the web-idiomatic shape silently produced
// broken Swift, and native ONLY accepted `net.isOnline` (a member shape with NO
// web equivalent — `useOnline()` exposes no `.isOnline` on the web). That broke
// the "write one shared source" promise for every useOnline consumer.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import {
  isKotlincAvailable,
  isSwiftcAvailable,
  validateKotlin,
  validateSwiftWithStubs,
} from '../validate'

// The web-idiomatic SHARED shape: read the accessor as `net()`, in both a
// `<Show when>` condition and a text-interpolation ternary (the HooksDemo shape).
const SHARED = `
  export function StatusBar() {
    const net = useOnline()
    return (
      <Stack>
        <Show when={() => net()}><Text>Online</Text></Show>
        <Text>{() => (net() ? 'ONLINE' : 'OFFLINE')}</Text>
      </Stack>
    )
  }
`

describe('Phase 4 — useOnline() native emit (shared web-idiomatic net() accessor)', () => {
  it('Swift: net() lowers to the @Observable isOnline Bool read (no .value)', () => {
    const r = transform(SHARED, { target: 'swift' })
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('@State private var net = PyreonNetworkStatus()')
    expect(r.code).toContain('net.isOnline')
    // The bare `net` fall-through (`if net {`) was the bug — it must be gone.
    expect(r.code).not.toContain('if net {')
    expect(r.code).not.toContain('net.isOnline.value')
  })

  it('Kotlin: net() lowers to the MutableState isOnline.value read', () => {
    const r = transform(SHARED, { target: 'kotlin' })
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('val net = remember { PyreonNetworkStatus() }')
    expect(r.code).toContain('net.isOnline.value')
    expect(r.code).not.toContain('if (net)')
  })

  // Compile-PROOF (not just a string match) — the M2.8 lesson: `swiftc -parse`
  // waves through type errors, so assert the emit TYPE-CHECKS against the
  // PyreonNetworkStatus stub. Runs on plain Linux via validateSwiftWithStubs;
  // skips gracefully when swiftc/kotlinc is absent.
  it.skipIf(!isSwiftcAvailable())('Swift: net() emit type-checks against the stub', () => {
    const out = transform(SHARED, { target: 'swift' }).code
    const res = validateSwiftWithStubs(out)
    expect(res.ok, res.error ?? '').toBe(true)
  })

  it.skipIf(!isKotlincAvailable())('Kotlin: net() emit compiles on kotlinc', () => {
    const out = transform(SHARED, { target: 'kotlin' }).code
    const res = validateKotlin(out)
    expect(res.ok, res.error ?? '').toBe(true)
  })

  // Back-compat: the legacy native-only `net.isOnline` MEMBER read still emits
  // (a native-only shape with no web analogue — kept working so this fix doesn't
  // silently break any existing native example that reaches for it directly).
  const MEMBER = `
    export function StatusBar() {
      const net = useOnline()
      return <Show when={() => net.isOnline}><Text>Online</Text></Show>
    }
  `
  it('Swift: legacy net.isOnline member read still emits', () => {
    const out = transform(MEMBER, { target: 'swift' }).code
    expect(out).toContain('net.isOnline')
    expect(out).not.toContain('net.isOnline.value')
  })

  it('Kotlin: legacy net.isOnline member read still emits (.value)', () => {
    const out = transform(MEMBER, { target: 'kotlin' }).code
    expect(out).toContain('net.isOnline.value')
  })
})
