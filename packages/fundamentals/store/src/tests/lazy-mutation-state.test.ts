// `mutation.state` is a LAZY snapshot. These lock the two contracts that make
// laziness safe: a sole subscriber reads the current state on first access,
// and with several subscribers the snapshot is taken BEFORE the first callback,
// so one subscriber's write can never leak into what another one reads.
import { signal } from '@pyreon/reactivity'
import { defineStore, resetAllStores } from '../index'

afterEach(() => resetAllStores())

describe('lazy mutation.state', () => {
  it('a sole subscriber reads the post-write state, cached across reads', () => {
    const api = defineStore('lazy-1', () => ({ count: signal(0), name: signal('a') }))()
    const seen: unknown[] = []
    api.subscribe((m) => {
      const first = m.state
      seen.push(first, m.state === first)
    })
    api.store.count.set(1)
    expect(seen).toEqual([{ count: 1, name: 'a' }, true])
  })

  it('with several subscribers, a write in the first does not leak into the second snapshot', () => {
    const api = defineStore('lazy-2', () => ({ count: signal(0), other: signal(0) }))()
    const second: unknown[] = []
    api.subscribe((m) => {
      if (m.events[0]?.key === 'count') api.store.other.set(99)
    })
    api.subscribe((m) => {
      if (m.events[0]?.key === 'count') second.push(m.state)
    })
    api.store.count.set(1)
    expect(second[0]).toEqual({ count: 1, other: 0 })
  })

  it('patch notifies once with every changed field, and state is the plain field snapshot', () => {
    const api = defineStore('lazy-3', () => ({ a: signal(1), b: signal('x'), act: () => 1 }))()
    const got: { type: string; keys: string[]; state: unknown }[] = []
    api.subscribe((m) => got.push({ type: m.type, keys: m.events.map((e) => e.key), state: m.state }))
    api.patch({ a: 2, b: 'y' })
    expect(got).toEqual([{ type: 'patch', keys: ['a', 'b'], state: { a: 2, b: 'y' } }])
  })

  it('the sole fast path follows subscribe / unsubscribe churn', () => {
    const api = defineStore('lazy-4', () => ({ n: signal(0) }))()
    const calls: string[] = []
    const offA = api.subscribe(() => calls.push('a'))
    const offB = api.subscribe(() => calls.push('b'))
    api.store.n.set(1)
    offA()
    api.store.n.set(2)
    offB()
    api.store.n.set(3)
    api.subscribe(() => calls.push('c'))
    api.store.n.set(4)
    expect(calls).toEqual(['a', 'b', 'b', 'c'])
  })

  it('an unsubscribed sole subscriber is never called again', () => {
    const api = defineStore('lazy-5', () => ({ n: signal(0) }))()
    let calls = 0
    const off = api.subscribe(() => calls++)
    api.store.n.set(1)
    off()
    api.store.n.set(2)
    api.patch({ n: 3 })
    expect(calls).toBe(1)
  })
})
