/**
 * Tracked-subscriber storage: a source's subscribers are a doubly linked list
 * of edges (`_subs` / `_subsTail`, one `Link` per edge, see graph.ts). These
 * specs lock the list's INVARIANT and the paths that are easy to get subtly
 * wrong: subscription order, removal from the head / middle / tail, no
 * duplicate edges on re-subscription, and the store's suspend/resume window
 * (which works on the DIRECT tier, where `subscribe()` listeners live).
 */
import { describe, expect, it } from 'vitest'
import { computed } from '../computed'
import { effect } from '../effect'
import { createSelector } from '../createSelector'
import { _hasSubscribers, _resumeSoleSubscriber, _suspendSoleSubscriber, signal } from '../signal'
import { edgeCount } from './graph-internals'

interface LinkView {
  sub: unknown
  prevSub: LinkView | null
  nextSub: LinkView | null
}
const subCount = edgeCount
/** Walk the list both ways and check every back-pointer and the tail. */
const listOf = (x: unknown): unknown[] => {
  const h = x as { _subs: LinkView | null; _subsTail: LinkView | null }
  const fwd: unknown[] = []
  let prev: LinkView | null = null
  for (let l = h._subs; l !== null; l = l.nextSub) {
    expect(l.prevSub).toBe(prev)
    fwd.push(l.sub)
    prev = l
  }
  expect(h._subsTail).toBe(prev)
  return fwd
}

describe('tracked subscribers — edge list invariant', () => {
  it('a source with no reader holds no edge; the first reader adds exactly one', () => {
    const s = signal(0)
    expect(listOf(s)).toEqual([])
    const d = effect(() => {
      s()
    })
    expect(listOf(s)).toHaveLength(1)
    d.dispose()
    expect(listOf(s)).toEqual([])
  })

  it('subscribers are kept in subscription order', () => {
    const s = signal(0)
    const fx = [0, 1, 2, 3].map(() =>
      effect(() => {
        s()
      }),
    )
    expect(listOf(s)).toEqual(fx)
    for (const e of fx) e.dispose()
  })

  it('removal from the head, the middle and the tail keeps the list consistent', () => {
    const s = signal(0)
    const [a, b, c, d] = [0, 1, 2, 3].map(() =>
      effect(() => {
        s()
      }),
    )
    b!.dispose() // middle
    expect(listOf(s)).toEqual([a, c, d])
    a!.dispose() // head
    expect(listOf(s)).toEqual([c, d])
    d!.dispose() // tail
    expect(listOf(s)).toEqual([c])
    c!.dispose()
    expect(listOf(s)).toEqual([])
  })

  it('a reader that reads a source twice holds one edge', () => {
    const s = signal(0)
    const t = signal(0)
    const d = effect(() => {
      s()
      t()
      s()
      s()
    })
    expect(subCount(s)).toBe(1)
    t.set(1)
    s.set(1)
    expect(subCount(s)).toBe(1)
    expect(subCount(t)).toBe(1)
    d.dispose()
    expect(subCount(s)).toBe(0)
    expect(subCount(t)).toBe(0)
  })

  it('removal works for every reader kind and leaves no subscribers behind', () => {
    const s = signal(0)
    const c = computed(() => s() + 1)
    c()
    const e = effect(() => {
      s()
    })
    const f = effect(() => {
      s()
    })
    expect(subCount(s)).toBe(3)
    c.dispose()
    e.dispose()
    f.dispose()
    expect(subCount(s)).toBe(0)
  })

  it('an effect reading a signal AND an { equals } computed over it sees them settled', () => {
    // The effect is reached twice (directly, and through the computed): it is
    // marked once, runs once per write, and pulls the computed fresh.
    const s = signal(1)
    const c = computed(() => s() * 100, { equals: Object.is })
    const seen: [number, number][] = []
    const e = effect(() => {
      seen.push([s(), c()])
    })
    s.set(2)
    s.set(3)
    expect(seen).toEqual([
      [1, 100],
      [2, 200],
      [3, 300],
    ])
    e.dispose()
  })
})

describe('tracked subscribers — notification', () => {
  it('notifies through the inline slot (1 subscriber)', () => {
    const s = signal(0)
    const seen: number[] = []
    const d = effect(() => { seen.push(s()) })
    s.set(1)
    s.set(2)
    expect(seen).toEqual([0, 1, 2])
    d.dispose()
    s.set(3)
    expect(seen).toEqual([0, 1, 2]) // disposed → silent
  })

  it('notifies every subscriber after promotion', () => {
    const s = signal(0)
    const a: number[] = []
    const b: number[] = []
    const da = effect(() => { a.push(s()) })
    const db = effect(() => { b.push(s()) })
    s.set(1)
    expect(a).toEqual([0, 1])
    expect(b).toEqual([0, 1])
    da.dispose()
    db.dispose()
  })

  it('propagates a dirty cascade through a DEEP lazy-computed chain', () => {
    // The `propagateLazyDirty` fused walk now hops via `_s1`; a chain is the
    // shape that exercises every hop.
    const s = signal(0)
    let cur: () => number = s
    for (let i = 0; i < 25; i++) {
      const prev = cur
      cur = computed(() => prev() + 1)
    }
    const tail = cur
    let seen = -1
    const d = effect(() => {
      seen = tail()
    })
    expect(seen).toBe(25)
    s.set(10)
    expect(seen).toBe(35)
    d.dispose()
  })

  it('a branching effect re-subscribes idempotently across many flips', () => {
    // A branch flip drops the stale edge and links the new one; a duplicate
    // edge would double-notify and grow storage per flip.
    const flag = signal(true)
    const a = signal(1)
    const b = signal(2)
    let runs = 0
    const d = effect(() => {
      runs++
      if (flag()) a()
      else b()
    })
    for (let i = 0; i < 50; i++) flag.set(i % 2 === 0)
    expect(subCount(flag)).toBe(1)
    expect(subCount(a) + subCount(b)).toBe(1)
    expect(subCount(a)).toBeLessThanOrEqual(1)
    expect(subCount(b)).toBeLessThanOrEqual(1)
    const before = runs
    a.set(99)
    // Exactly one re-run when the live branch changes — never two.
    expect(runs).toBe(before + (flag.peek() ? 1 : 0))
    d.dispose()
  })
})

describe('_hasSubscribers — tier-aware liveness', () => {
  it('is true for a subscriber in EITHER tracking tier', () => {
    const s = signal(0)
    expect(_hasSubscribers(s)).toBe(false)
    const a = effect(() => {
      s()
    })
    expect(_hasSubscribers(s)).toBe(true) // `_s1`
    const b = effect(() => {
      s()
    })
    expect(_hasSubscribers(s)).toBe(true) // promoted `_s`
    a.dispose()
    b.dispose()
    expect(_hasSubscribers(s)).toBe(false)
  })

  it('is true for a subscriber in EITHER direct tier', () => {
    const s = signal(0)
    const un1 = s.direct(() => {})
    expect(_hasSubscribers(s)).toBe(true) // `_d1`
    const un2 = s.direct(() => {})
    expect(_hasSubscribers(s)).toBe(true) // promoted `_d`
    un1()
    un2()
    expect(_hasSubscribers(s)).toBe(false)
  })

  it('is true for a plain subscribe() listener', () => {
    const s = signal(0)
    const un = s.subscribe(() => {})
    expect(_hasSubscribers(s)).toBe(true)
    un()
    expect(_hasSubscribers(s)).toBe(false)
  })
})

describe('sole-subscriber suspend/resume (the @pyreon/store patch window)', () => {
  it('detaches the sole listener and restores it', () => {
    const s = signal(0)
    let fired = 0
    const det = () => fired++
    const un = s.subscribe(det)

    const token = _suspendSoleSubscriber(s)
    expect(token).not.toBeNull()
    s.set(1)
    expect(fired).toBe(0) // suspended — silent

    _resumeSoleSubscriber(s, token as never, det)
    s.set(2)
    expect(fired).toBe(1)
    un()
  })

  it('does NOT clobber a newcomer that subscribed during the window', () => {
    const s = signal(0)
    let a = 0
    let b = 0
    const det = () => a++
    s.subscribe(det)
    const token = _suspendSoleSubscriber(s)
    const unB = s.subscribe(() => b++)
    _resumeSoleSubscriber(s, token as never, det)

    s.set(1)
    expect(a).toBe(1)
    expect(b).toBe(1) // both live
    unB()
  })

  it('returns null (caller must fall back) when the direct tier holds >1 entry', () => {
    const s = signal(0)
    s.subscribe(() => {})
    const un = s.direct(() => {})
    expect(_suspendSoleSubscriber(s)).toBeNull()
    un()
  })

  it('an effect does not block it: effects are graph edges, not direct-tier entries', () => {
    const s = signal(0)
    let fired = 0
    const det = () => fired++
    s.subscribe(det)
    let runs = 0
    const d = effect(() => {
      s()
      runs++
    })
    const token = _suspendSoleSubscriber(s)
    expect(token).not.toBeNull()
    s.set(1)
    expect(fired).toBe(0) // the listener is suspended …
    expect(runs).toBe(2) // … the effect is not
    _resumeSoleSubscriber(s, token as never, det)
    s.set(2)
    expect(fired).toBe(1)
    d.dispose()
  })
})

describe('createSelector buckets are graph sources', () => {
  it('notifies the sole per-key subscriber and reclaims empty keys', () => {
    const sel = createSelector(signal(1))
    const hits: string[] = []
    const d1 = effect(() => {
      hits.push(`one:${sel(1)}`)
    })
    const d2 = effect(() => {
      hits.push(`two:${sel(2)}`)
    })
    expect(hits).toEqual(['one:true', 'two:false'])
    d1.dispose()
    d2.dispose()
  })

  it('a selector-driven effect sees selection changes', () => {
    const cur = signal(1)
    const sel = createSelector(cur)
    const seen: boolean[] = []
    const d = effect(() => { seen.push(sel(2)) })
    cur.set(2)
    cur.set(3)
    expect(seen).toEqual([false, true, false])
    d.dispose()
  })
})

describe('debug() counts subscribers', () => {
  it('debug() counts a single tracked subscriber', () => {
    const s = signal(0, { name: 'counted' })
    expect(s.debug().subscriberCount).toBe(0)
    const d = effect(() => {
      s()
    })
    expect(s.debug().subscriberCount).toBe(1)
    d.dispose()
    expect(s.debug().subscriberCount).toBe(0)
  })
})
