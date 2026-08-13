// @vitest-environment node
//
// The SSR half of the `connectWebHost` contract (test-environment-parity:
// isServer-branching code needs a happy-dom test AND a Node-only test that
// verifies the fallback). In Node there is no `document`, so `isServer` is
// true and every method must be an inert no-op — importing a hosted bundle
// entry can never crash a server render.

import { describe, expect, it } from 'vitest'
import { connectWebHost } from '../web-host-bridge'

describe('connectWebHost — SSR (no window/document)', () => {
  it('returns inert no-ops off-browser', () => {
    const host = connectWebHost<{ x: number }>()
    expect(host.data()).toBeUndefined()
    expect(() => host.emit('anything')).not.toThrow()
    const off = host.onData(() => {
      throw new Error('onData must never fire off-browser')
    })
    expect(typeof off).toBe('function')
    expect(() => off()).not.toThrow() // unsubscribe is a safe no-op too
  })
})
