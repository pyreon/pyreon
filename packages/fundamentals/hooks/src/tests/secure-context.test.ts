/**
 * The secure-context diagnostic.
 *
 * The specs that matter are the ones asserting SILENCE. A warning that blames
 * the origin for an API the browser simply does not implement would send
 * someone to configure TLS for a problem TLS cannot fix — so "does not fire
 * when the context is secure" is as load-bearing as "fires when it is not".
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { __resetSecureContextWarnings, warnIfInsecureContext } from '../secure-context'

function setSecureContext(value: boolean | undefined): void {
  if (value === undefined) {
    Reflect.deleteProperty(window as unknown as Record<string, unknown>, 'isSecureContext')
    return
  }
  Object.defineProperty(window, 'isSecureContext', { value, configurable: true, writable: true })
}

describe('warnIfInsecureContext', () => {
  let warn: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    __resetSecureContextWarnings()
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    warn.mockRestore()
    setSecureContext(true)
  })

  it('names the API, the origin, and the fix', () => {
    setSecureContext(false)
    warnIfInsecureContext('useGeolocation')

    expect(warn).toHaveBeenCalledTimes(1)
    const message = String(warn.mock.calls[0]?.[0] ?? '')
    expect(message).toContain('useGeolocation')
    // The ORIGIN is the half that turns this from advice into a diagnosis.
    expect(message).toContain(window.location.origin)
    expect(message).toContain("https({ lan: true })")
    expect(message).toContain('@pyreon/zero/server')
  })

  it('stays SILENT when the context is secure — the API is genuinely unsupported', () => {
    // Firefox has no Web Bluetooth at any origin; Safari had no wakeLock for
    // years. Blaming TLS for those is worse than saying nothing.
    setSecureContext(true)
    warnIfInsecureContext('useBluetooth')
    expect(warn).not.toHaveBeenCalled()
  })

  it('stays silent when it cannot tell, rather than guessing', () => {
    setSecureContext(undefined)
    warnIfInsecureContext('useShare')
    expect(warn).not.toHaveBeenCalled()
  })

  it('warns once per API, however many components mount the hook', () => {
    setSecureContext(false)
    for (let i = 0; i < 5; i += 1) warnIfInsecureContext('useWakeLock')
    expect(warn).toHaveBeenCalledTimes(1)
  })

  it('keeps a separate memo per API', () => {
    setSecureContext(false)
    warnIfInsecureContext('useCamera')
    warnIfInsecureContext('useGeolocation')
    expect(warn).toHaveBeenCalledTimes(2)
  })

  it('is silent in production, where the string must tree-shake out entirely', () => {
    setSecureContext(false)
    const previous = process.env.NODE_ENV
    process.env.NODE_ENV = 'production'
    try {
      warnIfInsecureContext('useGeolocation')
      expect(warn).not.toHaveBeenCalled()
    } finally {
      process.env.NODE_ENV = previous
    }
  })
})
