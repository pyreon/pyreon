/**
 * The store API's methods are own properties bound to their store, so every
 * way people hold them keeps working: destructured, passed detached, and
 * copied by a spread (the schema-store wrapper spreads the inner API).
 *
 * Lazy prototype getters were measured as the same speed, and a spread
 * silently dropped every method — this file is what fails if they return.
 */
import { signal } from '@pyreon/reactivity'
import { afterEach, describe, expect, it } from 'vitest'
import { defineStore, resetAllStores } from '../index'

afterEach(() => resetAllStores())

const useCounter = defineStore('api-method-forms', () => {
  const count = signal(0)
  return { count, inc: () => count.set(count() + 1) }
})

describe('store API method forms', () => {
  it('works destructured', () => {
    const { store, patch, reset } = useCounter()
    patch({ count: 5 })
    expect(store.count()).toBe(5)
    reset()
    expect(store.count()).toBe(0)
  })

  it('works detached', () => {
    const api = useCounter()
    const seen: number[] = []
    const subscribe = api.subscribe
    const off = subscribe((_m, state) => seen.push(state.count as number))
    const detachedPatch = api.patch
    detachedPatch({ count: 2 })
    off()
    const run = (fn: () => void) => fn()
    run(api.reset)
    expect(seen).toEqual([2])
    expect(api.store.count()).toBe(0)
  })

  it('survives a spread', () => {
    const api = useCounter()
    const copy = { ...api }
    for (const key of ['store', 'id', 'patch', 'subscribe', 'onAction', 'reset', 'dispose'] as const) {
      expect(copy[key], key).toBeDefined()
    }
    copy.patch({ count: 3 })
    expect(api.store.count()).toBe(3)
  })

  it('keeps method identity per store', () => {
    const api = useCounter()
    expect(api.patch).toBe(useCounter().patch)
  })
})
