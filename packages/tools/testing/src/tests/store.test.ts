/**
 * `@pyreon/testing/store` — happy-dom suite.
 *
 * installStoreReset: cross-test isolation via afterEach(resetAllStores).
 * withFreshStore: scoped fresh-instance isolation (sync, async, throwing).
 * Both build on @pyreon/store's dispose-on-reset contract (locked in
 * @pyreon/store's own reset-dispose.test.ts).
 */
import { defineStore, effect, resetAllStores, signal } from '@pyreon/store'
import { describe, expect, it } from 'vitest'
import { installStoreReset, withFreshStore } from '../store'

const useCounter = defineStore('testing-store-counter', () => {
  const count = signal(0)
  return { count, increment: () => count.update((n) => n + 1) }
})

describe('installStoreReset', () => {
  installStoreReset()

  it('test A dirties the singleton', () => {
    const counter = useCounter()
    counter.store.increment()
    counter.store.increment()
    expect(counter.store.count()).toBe(2)
  })

  it('test B starts from a fresh instance (afterEach reset ran)', () => {
    const counter = useCounter()
    expect(counter.store.count()).toBe(0)
  })
})

describe('withFreshStore', () => {
  it('gives the callback a fresh instance even when the singleton is dirty', () => {
    const dirty = useCounter()
    dirty.store.increment()
    expect(dirty.store.count()).toBe(1)

    withFreshStore(useCounter, (counter) => {
      expect(counter.store.count()).toBe(0) // pre-existing dirty instance disposed
      counter.store.increment()
    })

    // Disposed after the callback — next use rebuilds from setup().
    expect(useCounter().store.count()).toBe(0)
    resetAllStores()
  })

  it('returns the callback result (sync)', () => {
    const result = withFreshStore(useCounter, (counter) => {
      counter.store.increment()
      return counter.store.count()
    })
    expect(result).toBe(1)
    resetAllStores()
  })

  it('awaits async callbacks and disposes after settle', async () => {
    const result = await withFreshStore(useCounter, async (counter) => {
      await Promise.resolve()
      counter.store.increment()
      return counter.store.count()
    })
    expect(result).toBe(1)
    expect(useCounter().store.count()).toBe(0)
    resetAllStores()
  })

  it('disposes even when the callback throws', () => {
    expect(() =>
      withFreshStore(useCounter, (counter) => {
        counter.store.increment()
        throw new Error('boom')
      }),
    ).toThrow('boom')
    expect(useCounter().store.count()).toBe(0)
    resetAllStores()
  })

  it('disposes after an async rejection too', async () => {
    let inScopeRuns = 0
    const external = signal(0)
    const useEffectful = defineStore('testing-store-effectful', () => {
      effect(() => {
        external()
        inScopeRuns++
      })
      return { v: signal(1) }
    })
    await expect(
      withFreshStore(useEffectful, async () => {
        await Promise.resolve()
        throw new Error('async boom')
      }),
    ).rejects.toThrow('async boom')
    // The fresh instance was disposed — its setup-scope effect is dead.
    const runsAfterDispose = inScopeRuns
    external.set(1)
    expect(inScopeRuns).toBe(runsAfterDispose)
    resetAllStores()
  })
})
