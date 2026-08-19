/**
 * Coverage for the PROMOTED-SET shapes of the sole-subscriber suspend/resume
 * pair — `@pyreon/store`'s `patch()` fast path.
 *
 * The dominant shape (`_s1` inline slot occupied) is exercised everywhere. The
 * Set shapes are only reachable when a signal PROMOTED past one tracking
 * subscriber and later shrank back to one — there is no demotion, so the Set
 * survives at size 1. That is rare in an app and absent from the other suites,
 * which is why these lines were the package's coverage hole.
 *
 * Driven through the real `effect`/`dispose` lifecycle rather than by poking
 * fields, so the shapes are the ones the runtime actually produces.
 */
import {
  _resumeSoleSubscriber,
  _suspendSoleSubscriber,
  effect,
  signal,
} from '../index'
import { accessInternal } from '@pyreon/test-utils'

/** Drive a signal into the "promoted Set that shrank back to 1" shape. */
function promotedThenShrunk(): { sig: ReturnType<typeof signal<number>>; runs: () => number } {
  const sig = signal(0)
  let n = 0
  const a = effect(() => {
    sig()
    n++
  })
  const b = effect(() => {
    sig()
  })
  // Two tracking subscribers → `_s1` promoted into `_s`.
  const internals = accessInternal<{ _s1: unknown; _s: Set<unknown> | null }>(sig)
  expect(internals._s1).toBeNull()
  expect(internals._s?.size).toBe(2)

  b.dispose() // back to one — but the Set stays (no demotion)
  expect(internals._s?.size).toBe(1)
  void a
  return { sig, runs: () => n }
}

describe('_suspendSoleSubscriber / _resumeSoleSubscriber — Set shapes', () => {
  it('suspends a promoted Set that shrank back to exactly one', () => {
    const { sig } = promotedThenShrunk()
    const internals = accessInternal<{ _s: Set<unknown> | null }>(sig)

    const token = _suspendSoleSubscriber(sig)

    expect(token).not.toBeNull()
    expect(token).toBeInstanceOf(Set)
    // Detached: the signal now has no tracking subscribers at all.
    expect(internals._s).toBeNull()
  })

  it('REFUSES to suspend when more than one subscriber is present', () => {
    const sig = signal(0)
    const a = effect(() => {
      sig()
    })
    const b = effect(() => {
      sig()
    })
    const internals = accessInternal<{ _s: Set<unknown> | null }>(sig)
    expect(internals._s?.size).toBe(2)

    // The precondition ("the sole subscriber IS the caller's listener") cannot
    // hold with two, so the fast path must decline rather than detach one.
    expect(_suspendSoleSubscriber(sig)).toBeNull()
    expect(internals._s?.size).toBe(2)

    a.dispose()
    b.dispose()
  })

  it('restores the Set verbatim when nobody arrived during the window', () => {
    const { sig, runs } = promotedThenShrunk()
    const before = runs()

    const token = _suspendSoleSubscriber(sig)
    // Detached — a write in the window must not reach the suspended subscriber.
    sig.set(1)
    expect(runs()).toBe(before)

    _resumeSoleSubscriber(sig, token!, () => {})
    sig.set(2)
    expect(runs()).toBe(before + 1)
  })

  it('folds the listener in rather than clobbering a newcomer that arrived mid-window', () => {
    const { sig } = promotedThenShrunk()

    const token = _suspendSoleSubscriber(sig)
    // A NEW tracking subscriber lands while the original is detached.
    let newcomerRuns = 0
    const newcomer = effect(() => {
      sig()
      newcomerRuns++
    })
    const atArrival = newcomerRuns

    // Restoring must not overwrite the newcomer with the saved Set.
    _resumeSoleSubscriber(sig, token!, () => {})

    sig.set(1)
    expect(newcomerRuns).toBeGreaterThan(atArrival)

    newcomer.dispose()
  })
})
