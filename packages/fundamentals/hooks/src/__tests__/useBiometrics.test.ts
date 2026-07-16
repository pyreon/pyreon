import { afterEach, describe, expect, it } from 'vitest'
import { useBiometrics } from '../useBiometrics'

afterEach(() => {
  delete (window as unknown as Record<string, unknown>).PublicKeyCredential
})

describe('useBiometrics', () => {
  it('authenticate() resolves to a boolean and never rejects (web v1 → false)', async () => {
    const bio = useBiometrics()
    const ok = await bio.authenticate('Unlock')
    expect(ok).toBe(false)
  })

  it('authenticate() accepts any reason string without throwing', async () => {
    const bio = useBiometrics()
    await expect(bio.authenticate('')).resolves.toBe(false)
    await expect(bio.authenticate('Confirm payment')).resolves.toBe(false)
  })

  it('isAvailable() reflects PublicKeyCredential presence (feature-detect)', () => {
    // Absent → not available.
    delete (window as unknown as Record<string, unknown>).PublicKeyCredential
    expect(useBiometrics().isAvailable()).toBe(false)

    // Present (a platform authenticator) → available.
    Object.defineProperty(window, 'PublicKeyCredential', {
      value: function PublicKeyCredential() {},
      writable: true,
      configurable: true,
    })
    expect(useBiometrics().isAvailable()).toBe(true)
  })
})
