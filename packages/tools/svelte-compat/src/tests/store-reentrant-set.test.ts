// Svelte parity: a store `set` made from inside a subscriber is queued, so
// every subscriber sees the values in order and ends on the latest one.
import { derived, writable } from '../index'

describe('store notifications under a re-entrant set', () => {
  test('a set inside a subscriber does not leave a later subscriber on a stale value', () => {
    const store = writable(0)
    const seenA: number[] = []
    const seenB: number[] = []
    store.subscribe((v) => {
      seenA.push(v)
      if (v === 1) store.set(2)
    })
    store.subscribe((v) => seenB.push(v))
    store.set(1)
    expect(seenA).toEqual([0, 1, 2])
    expect(seenB).toEqual([0, 1, 2])
  })

  test('a derived store downstream of a re-entrant set ends on the latest value', () => {
    const store = writable(0)
    store.subscribe((v) => {
      if (v === 1) store.set(2)
    })
    const doubled = derived(store, (v: number) => v * 2)
    const seen: number[] = []
    doubled.subscribe((v) => seen.push(v))
    store.set(1)
    expect(seen.at(-1)).toBe(4)
  })

  test('a throwing subscriber does not stop later sets from notifying', () => {
    const store = writable(0)
    let boom = true
    store.subscribe((v) => {
      if (v === 1 && boom) throw new Error('boom')
    })
    const seen: number[] = []
    store.subscribe((v) => seen.push(v))
    expect(() => store.set(1)).toThrow('boom')
    boom = false
    store.set(2)
    expect(seen.at(-1)).toBe(2)
  })
})
