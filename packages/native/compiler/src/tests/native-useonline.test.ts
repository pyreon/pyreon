// Phase 4 — `useOnline()` native emit. Own test file (not
// canonical-primitives.test.ts) to avoid append-conflicts with in-flight
// emit PRs that also extend that file.
//
// `const net = useOnline()` → the PyreonNetworkStatus reactive connectivity
// container (#1040). Swift `@State PyreonNetworkStatus()`; Kotlin
// `remember { PyreonNetworkStatus() }`. The `net.isOnline` read is a plain
// @Observable property on Swift, a Compose `MutableState` (`.value`) on Kotlin.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'

const SRC = `
  export function StatusBar() {
    const net = useOnline()
    return <Show when={() => net.isOnline}><Text>Online</Text></Show>
  }
`

describe('Phase 4 — useOnline() native emit', () => {
  it('Swift: @State PyreonNetworkStatus + plain isOnline read', () => {
    const out = transform(SRC, { target: 'swift' }).code
    expect(out).toContain('@State private var net = PyreonNetworkStatus()')
    expect(out).toContain('net.isOnline')
    expect(out).not.toContain('net.isOnline.value')
  })

  it('Kotlin: remember { PyreonNetworkStatus() } + isOnline.value read', () => {
    const out = transform(SRC, { target: 'kotlin' }).code
    expect(out).toContain('val net = remember { PyreonNetworkStatus() }')
    expect(out).toContain('net.isOnline.value')
  })
})
