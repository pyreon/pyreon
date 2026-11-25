/**
 * Coverage for the PROMOTED-SET shapes of the sole-subscriber suspend/resume
 * pair — `@pyreon/store`'s `patch()` fast path.
 *
 * `subscribe()` listeners live in a signal's DIRECT tier (`_d1` inline slot,
 * promoted to the `_d` Set by a second entry). The dominant shape (the inline
 * slot occupied) is exercised everywhere. The Set shapes are only reachable
 * when the tier PROMOTED past one entry and later shrank back to one — there
 * is no demotion, so the Set survives at size 1.
 *
 * Driven through the real `subscribe` / unsubscribe lifecycle rather than by
 * poking fields, so the shapes are the ones the runtime actually produces.
 */
import {
  effect,
  signal,
} from '../index'
import {
  _resumeSoleSubscriber,
  _suspendSoleSubscriber,
} from '../internal'
import { accessInternal } from '@pyreon/test-utils'

/** Drive a signal into the "promoted Set that shrank back to 1" shape. */
function promotedThenShrunk(): {
  sig: ReturnType<typeof signal<number>>
  listener: () => void
  runs: () => number
} {
  const sig = signal(0)
  let n = 0
  const listener = () => {
    n++
  }
  sig.subscribe(listener)
  const offB = sig.subscribe(() => {})
  const offC = sig.subscribe(() => {})
  // Three entries → the inline slot promoted into `_d`.
  const internals = accessInternal<{ _d1: unknown; _d: Set<unknown> | null }>(sig)
  expect(internals._d1).toBeNull()
  expect(internals._d?.size).toBe(3)

  offB()
  offC() // back to one — but the Set stays (no demotion)
  expect(internals._d?.size).toBe(1)
  return { sig, listener, runs: () => n }
}

describe('_suspendSoleSubscriber / _resumeSoleSubscriber — Set shapes', () => {
  it('suspends a promoted Set that shrank back to exactly one', () => {
    const { sig } = promotedThenShrunk()
    const internals = accessInternal<{ _d: Set<unknown> | null }>(sig)

    const token = _suspendSoleSubscriber(sig)

    expect(token).not.toBeNull()
    expect(token).toBeInstanceOf(Set)
    // Detached: the signal now has no direct-tier entries at all.
    expect(internals._d).toBeNull()
  })

  it('REFUSES to suspend when more than one listener is present', () => {
    const sig = signal(0)
    const offA = sig.subscribe(() => {})
    const offB = sig.subscribe(() => {})
    const internals = accessInternal<{ _d1: unknown; _d: Set<unknown> | null }>(sig)
    expect(internals._d?.size).toBe(2)

    // The precondition ("the sole entry IS the caller's listener") cannot hold
    // with two, so the fast path must decline rather than detach one.
    expect(_suspendSoleSubscriber(sig)).toBeNull()
    expect(internals._d?.size).toBe(2)

    offA()
    offB()
  })

  it('restores the Set verbatim when nobody arrived during the window', () => {
    const { sig, listener, runs } = promotedThenShrunk()
    const before = runs()

    const token = _suspendSoleSubscriber(sig)
    // Detached — a write in the window must not reach the suspended listener.
    sig.set(1)
    expect(runs()).toBe(before)

    _resumeSoleSubscriber(sig, token!, listener)
    sig.set(2)
    expect(runs()).toBe(before + 1)
  })

  it('folds the listener in rather than clobbering a newcomer that arrived mid-window', () => {
    const { sig, listener, runs } = promotedThenShrunk()

    const token = _suspendSoleSubscriber(sig)
    // A NEW listener lands while the original is detached.
    let newcomerRuns = 0
    const off = sig.subscribe(() => {
      newcomerRuns++
    })

    // Restoring must not overwrite the newcomer with the saved Set.
    _resumeSoleSubscriber(sig, token!, listener)

    const before = runs()
    sig.set(1)
    expect(newcomerRuns).toBe(1)
    expect(runs()).toBe(before + 1)

    off()
  })

  it('an effect on the same signal is not in the direct tier, so it never blocks or loses a run', () => {
    const { sig, listener } = promotedThenShrunk()
    let effectRuns = 0
    const e = effect(() => {
      sig()
      effectRuns++
    })
    const token = _suspendSoleSubscriber(sig)
    expect(token).not.toBeNull()
    sig.set(1)
    expect(effectRuns).toBe(2)
    _resumeSoleSubscriber(sig, token!, listener)
    e.dispose()
  })
})
