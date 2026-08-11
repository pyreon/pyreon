// Unit contract for `installHappyDomHashchangeEchoGuard` — runs under this
// package's happy-dom environment, so happy-dom's REAL deferred `hashchange`
// dispatch (a setTimeout queued by Location[setURL]) is exercised, not a mock.
//
// NOTE: the guard installs once per WINDOW (symbol-keyed idempotency), and
// this whole file shares one happy-dom window — so the guard is installed in
// the first test and stays installed. Specs are ordered so the pre-install
// baseline (happy-dom DOES fire the non-spec echo) is captured first.
import { describe, expect, it, vi } from 'vitest'
import { installHappyDomHashchangeEchoGuard } from '../happy-dom-hashchange-guard'

const settle = (): Promise<void> => new Promise((r) => setTimeout(r, 50))

function listenOnce(): { events: HashChangeEvent[]; dispose: () => void } {
  const events: HashChangeEvent[] = []
  const handler = (e: Event): void => {
    events.push(e as HashChangeEvent)
  }
  window.addEventListener('hashchange', handler)
  return { events, dispose: () => window.removeEventListener('hashchange', handler) }
}

describe('installHappyDomHashchangeEchoGuard', () => {
  it('BASELINE (pre-install): happy-dom fires a deferred hashchange for a hash-changing pushState', async () => {
    // This is the non-spec behavior the guard exists to suppress. If a
    // happy-dom upgrade ever stops firing it, the guard becomes dead weight —
    // this spec is the tripwire that says so.
    window.history.replaceState(null, '', '/')
    await settle() // drain any echo from the replaceState above
    const { events, dispose } = listenOnce()
    window.history.pushState(null, '', '#/baseline')
    await settle()
    dispose()
    expect(events.length).toBe(1)
    expect(events[0]!.oldURL).not.toBe('') // happy-dom populates oldURL
  })

  it('swallows the deferred echo for hash-changing pushState/replaceState after install', async () => {
    window.history.replaceState(null, '', '/')
    await settle()
    installHappyDomHashchangeEchoGuard()
    const { events, dispose } = listenOnce()
    window.history.pushState(null, '', '#/guarded')
    window.history.replaceState(null, '', '#/guarded-2')
    await settle()
    dispose()
    expect(events.length).toBe(0)
  })

  it('does NOT swallow a hash-UNCHANGING pushState (no echo queued, no counter drift)', async () => {
    window.history.replaceState(null, '', '/plain')
    await settle()
    const { events, dispose } = listenOnce()
    window.history.pushState(null, '', '/other-plain') // hash '' → '' : not counted
    await settle()
    dispose()
    expect(events.length).toBe(0) // nothing fired, nothing swallowed
  })

  it('does NOT swallow a manual test-dispatched HashChangeEvent (empty oldURL)', async () => {
    // Back-button simulations do `replaceState + dispatchEvent(hashchange)`;
    // the manual event's oldURL is '' (happy-dom populates it only on its own
    // synthetic dispatches), so it must pass through even while a synthetic
    // swallow is pending.
    window.history.replaceState(null, '', '/')
    await settle()
    const { events, dispose } = listenOnce()
    window.history.pushState(null, '', '#/pending') // synthetic swallow pending
    window.dispatchEvent(new HashChangeEvent('hashchange')) // manual — oldURL ''
    await settle()
    dispose()
    expect(events.length).toBe(1)
    expect(events[0]!.oldURL).toBe('')
  })

  it('does NOT swallow a real `location.hash =` fragment navigation', async () => {
    // location.hash assignment is a REAL fragment navigation — hashchange IS
    // spec there; it bypasses the wrapped History methods entirely.
    window.history.replaceState(null, '', '/')
    await settle()
    const { events, dispose } = listenOnce()
    window.location.hash = '#real-fragment-nav'
    await settle()
    dispose()
    expect(events.length).toBe(1)
  })

  it('is idempotent per window (second install does not double-wrap History)', async () => {
    installHappyDomHashchangeEchoGuard() // second call — must no-op
    window.history.replaceState(null, '', '/')
    await settle()
    const { events, dispose } = listenOnce()
    // If the second install had re-wrapped pushState, this ONE hash change
    // would increment the pending counter TWICE — and the counter surplus
    // would then swallow the next LEGIT event. Prove the counter is exact:
    window.history.pushState(null, '', '#/once')
    await settle() // one echo queued, one swallowed — counter back to 0
    window.dispatchEvent(new HashChangeEvent('hashchange')) // manual, passes
    window.location.hash = '#still-real' // real fragment nav, passes
    await settle()
    dispose()
    expect(events.length).toBe(2)
  })

  it('no-ops outside a DOM environment (typeof window === "undefined")', () => {
    vi.stubGlobal('window', undefined)
    try {
      expect(() => installHappyDomHashchangeEchoGuard()).not.toThrow()
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
