import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { _resetRegistry, _resetStorageListener, useStorage } from '../index'

/**
 * REGRESSION: `useStorage`'s cross-tab listener refcount under-counts
 * consumers. The first `useStorage(key)` call retains; same-key cached
 * returns DO NOT retain. `.remove()` always releases. Result: when one
 * of N consumers calls `.remove()`, the listener is detached even
 * though N-1 consumers still hold the (now orphaned) signal — cross-tab
 * updates stop flowing to them.
 *
 * Fix (paired with `useStorage` body): every `useStorage(key)` call
 * retains; `.remove()` is idempotent per consumer (the StorageSignal
 * carries a `_disposed` flag).
 */
describe('useStorage — cross-tab listener refcount survives same-key consumer remove()', () => {
  beforeEach(() => {
    _resetRegistry()
    _resetStorageListener()
  })
  afterEach(() => {
    _resetRegistry()
    _resetStorageListener()
  })

  it('REGRESSION: surviving consumer still gets cross-tab updates after a sibling calls .remove()', () => {
    // First consumer creates the signal + retains the listener.
    const t1 = useStorage('theme', 'light')
    // Second consumer returns the cached signal — must ALSO retain.
    const t2 = useStorage('theme', 'light')
    expect(t1).toBe(t2)

    // One consumer removes. Pre-fix: refcount drops to 0, listener detached,
    // registry entry removed; t2 is orphaned from the cross-tab pipeline.
    t1.remove()

    // Cross-tab event for 'theme' must still flow through to the surviving
    // consumer. Pre-fix: no listener attached → t2 stays at the
    // default-reset value 'light'.
    const storageEvent = Object.assign(new Event('storage'), {
      key: 'theme',
      newValue: JSON.stringify('dark'),
      storageArea:
        typeof window !== 'undefined' && 'localStorage' in window ? window.localStorage : undefined,
    })
    window.dispatchEvent(storageEvent)

    expect(t2()).toBe('dark')
  })

  it('registry entry survives .remove() so cross-tab routing keeps working', () => {
    // Two consumers — same shared signal.
    const t1 = useStorage('theme', 'light')
    const t2 = useStorage('theme', 'light')

    t1.remove() // resets to default, clears storage, releases ONE retain

    // After remove(): signal is reset, storage is cleared, BUT the
    // registry entry stays (since refcount didn't drop to 0). The
    // cross-tab listener can still route incoming `storage` events to
    // the surviving consumer.
    expect(t2()).toBe('light')

    // A subsequent useStorage('theme', ...) call must return the
    // SAME signal — proving the registry entry survived.
    const t3 = useStorage('theme', 'light')
    expect(t3).toBe(t1)
    expect(t3).toBe(t2)
  })
})
