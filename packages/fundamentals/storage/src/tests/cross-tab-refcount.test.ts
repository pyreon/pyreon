import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { _resetRegistry, _resetStorageListener, useStorage } from '../index'

/**
 * REGRESSION: one consumer's `.remove()` must not cut the others (or itself)
 * off from cross-tab updates. Every `useStorage(key)` call retains the listener
 * and the registry entry; only the owner scope's disposal releases them, and
 * `.remove()` releases nothing (#4381).
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

    // One consumer removes. The listener and the registry entry must stay.
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

    t1.remove() // resets to default, clears storage, keeps the binding

    // After remove(): signal is reset, storage is cleared, and the registry
    // entry stays, so the cross-tab listener still routes incoming `storage`
    // events to every consumer.
    expect(t2()).toBe('light')

    // A subsequent useStorage('theme', ...) call must return the
    // SAME signal — proving the registry entry survived.
    const t3 = useStorage('theme', 'light')
    expect(t3).toBe(t1)
    expect(t3).toBe(t2)
  })
})
