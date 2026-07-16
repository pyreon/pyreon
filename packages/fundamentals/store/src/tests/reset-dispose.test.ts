/**
 * resetStore / resetAllStores must DISPOSE the store — not merely drop the
 * registry entry. Pre-fix, reset orphaned the entry while the store's
 * effectScope kept firing on external signals forever (leak class B:
 * subscriber retention after "reset"), and plugin cleanups never ran.
 *
 * Bisect-verified: reverting resetStore/resetAllStores to bare
 * `registry.delete(id)` / `registry.clear()` fails the "stops setup-scope
 * effects" + "runs plugin cleanups" specs below.
 */
import { afterEach, describe, expect, test } from 'vitest'
import { defineStore, effect, resetAllStores, resetStore, signal } from '../index'

afterEach(() => {
  resetAllStores()
})

describe('resetStore disposes the store', () => {
  test('stops setup-scope effects on external signals', () => {
    const external = signal(0)
    let runs = 0
    const useStore = defineStore('reset-dispose-a', () => {
      effect(() => {
        external()
        runs++
      })
      return { value: signal(1) }
    })

    useStore()
    expect(runs).toBe(1)
    external.set(1)
    expect(runs).toBe(2)

    resetStore('reset-dispose-a')
    external.set(2)
    // Pre-fix: the orphaned scope kept firing (runs would be 3).
    expect(runs).toBe(2)
  })

  test('next useStore() after reset rebuilds fresh state', () => {
    const useStore = defineStore('reset-dispose-b', () => ({ count: signal(0) }))
    const first = useStore()
    first.store.count.set(41)
    resetStore('reset-dispose-b')
    const second = useStore()
    expect(second.store.count()).toBe(0)
  })
})

describe('resetAllStores disposes every store', () => {
  test('stops all setup-scope effects', () => {
    const external = signal(0)
    let runsA = 0
    let runsB = 0
    const useA = defineStore('reset-dispose-c', () => {
      effect(() => {
        external()
        runsA++
      })
      return { v: signal(1) }
    })
    const useB = defineStore('reset-dispose-d', () => {
      effect(() => {
        external()
        runsB++
      })
      return { v: signal(1) }
    })
    useA()
    useB()
    resetAllStores()
    external.set(1)
    expect(runsA).toBe(1)
    expect(runsB).toBe(1)
  })
})

// LAST describe on purpose: addStorePlugin has no removal API, so the plugin
// registered here applies to every store created after it IN THIS FILE (files
// are worker-isolated). Keeping it last means the earlier specs never see it.
describe('reset runs plugin cleanups (dispose contract)', () => {
  test('plugin-returned cleanup fires on resetStore', async () => {
    const { addStorePlugin } = await import('../index')
    let cleanups = 0
    addStorePlugin(() => () => {
      cleanups++
    })
    const useStore = defineStore('reset-dispose-e', () => ({ v: signal(1) }))
    useStore()
    expect(cleanups).toBe(0)
    resetStore('reset-dispose-e')
    // Pre-fix: reset dropped the entry without dispose → cleanup never ran.
    expect(cleanups).toBe(1)
  })
})
