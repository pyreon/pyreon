// useSecureStorage had no web half — the fifth hook in this arc with that
// gap, after useGeolocation, useDatabase, useWebSocket and useMap.
//
// These assert the SHARED-CODE CONTRACT, not merely that the hook works.
// Every semantic below is copied from `PyreonSecureStorage` (Swift and
// Kotlin agree — the runtime smoke suites assert the identical set), and
// each is one an independent reimplementation would plausibly get wrong:
// KEY-FIRST write, null-not-undefined reads, idempotent remove, an
// app-wide (module-scoped) store.

import { beforeEach, describe, expect, it } from 'vitest'
import { useSecureStorage } from '../useSecureStorage'

describe('useSecureStorage (web half)', () => {
  beforeEach(() => {
    // The store is deliberately module-scoped (app-wide, like the
    // Keychain) — reset between tests through the public surface.
    const s = useSecureStorage()
    for (const k of ['auth', 'k', 'a', 'b', 'never-written']) s.remove(k)
  })

  it('write → read → contains round-trip, KEY FIRST', () => {
    const s = useSecureStorage()
    expect(s.read('auth')).toBeNull()
    expect(s.contains('auth')).toBe(false)
    expect(s.write('auth', 'ey.token')).toBe(true)
    expect(s.read('auth')).toBe('ey.token')
    expect(s.contains('auth')).toBe(true)
  })

  it('write overwrites', () => {
    const s = useSecureStorage()
    s.write('k', 'first')
    s.write('k', 'second')
    expect(s.read('k')).toBe('second')
  })

  it('remove deletes and is idempotent (true even when absent)', () => {
    const s = useSecureStorage()
    s.write('k', 'secret')
    expect(s.remove('k')).toBe(true)
    expect(s.read('k')).toBeNull()
    expect(s.contains('k')).toBe(false)
    expect(s.remove('never-written')).toBe(true)
  })

  it('keys are isolated — removing one leaves the others', () => {
    const s = useSecureStorage()
    s.write('a', 'a-val')
    s.write('b', 'b-val')
    s.remove('a')
    expect(s.read('a')).toBeNull()
    expect(s.read('b')).toBe('b-val')
  })

  it('the store is app-wide: two hook calls see the same secrets (Keychain semantics)', () => {
    const one = useSecureStorage()
    const two = useSecureStorage()
    one.write('auth', 'shared')
    expect(two.read('auth')).toBe('shared')
  })

  it('absent reads are null, not undefined (the cross-platform String? contract)', () => {
    const s = useSecureStorage()
    expect(s.read('never-written')).toBeNull()
    expect(s.read('never-written')).not.toBeUndefined()
  })
})
