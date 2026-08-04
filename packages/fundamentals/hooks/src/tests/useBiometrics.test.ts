// `useBiometrics` — the web half of the shared biometric-auth hook.
//
// It had no test. The web implementation is deliberately conservative and that
// conservatism is the contract worth pinning: a real WebAuthn assertion needs a
// server-issued challenge and a registered credential, neither of which a
// client-only hook can produce. So `authenticate` resolves FALSE rather than
// rejecting — a rejection would make every shared call site need a try/catch
// that is unnecessary on iOS and Android, where the same source compiles to a
// real Face ID / BiometricPrompt call.

import { describe, expect, it } from 'vitest'
import { useBiometrics } from '../useBiometrics'

describe('useBiometrics (web)', () => {
  it('authenticate RESOLVES false rather than rejecting', async () => {
    // Rejecting would force a try/catch into source that also compiles for
    // native, where the call genuinely succeeds.
    await expect(useBiometrics().authenticate('unlock notes')).resolves.toBe(false)
  })

  it('reports available when the platform exposes PublicKeyCredential', () => {
    const g = globalThis as { PublicKeyCredential?: unknown }
    const had = 'PublicKeyCredential' in g
    const prev = g.PublicKeyCredential
    g.PublicKeyCredential = function PublicKeyCredential() {}
    try {
      expect(useBiometrics().isAvailable()).toBe(true)
    } finally {
      if (had) g.PublicKeyCredential = prev
      else delete g.PublicKeyCredential
    }
  })

  it('reports UNAVAILABLE when PublicKeyCredential is absent', () => {
    // happy-dom does not implement WebAuthn, which is the realistic shape for
    // any browser without a platform authenticator. This arm was uncovered.
    const g = globalThis as { PublicKeyCredential?: unknown }
    const had = 'PublicKeyCredential' in g
    const prev = g.PublicKeyCredential
    delete g.PublicKeyCredential
    try {
      expect(useBiometrics().isAvailable()).toBe(false)
    } finally {
      if (had) g.PublicKeyCredential = prev
    }
  })

  it('exposes the exact member names the native container matches on', () => {
    // PMTC matches hook members by NAME; a rename here silently breaks the
    // iOS/Android lowering with nothing on the web side failing.
    const b = useBiometrics()
    expect(typeof b.authenticate).toBe('function')
    expect(typeof b.isAvailable).toBe('function')
  })
})
