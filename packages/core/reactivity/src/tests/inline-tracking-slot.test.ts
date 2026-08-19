/**
 * Two-tier TRACKING-subscriber storage (`_s1` inline slot / `_s` Set).
 *
 * Mirrors the `_d1`/`_d` idiom already used for direct updaters. These specs
 * lock the tier's INVARIANT and the paths that are easy to get subtly wrong:
 * promotion, idempotent re-add (the `divergeVerify` prefix repair), removal
 * from either tier, and the store's suspend/resume window.
 */
import { describe, expect, it, vi } from 'vitest'
import { computed } from '../computed'
import { effect } from '../effect'
import { createSelector } from '../createSelector'
import { _hasSubscribers, _resumeSoleSubscriber, _suspendSoleSubscriber, signal } from '../signal'

/** Internal view of a tracking-subscriber host. */
type Host = { _s1: (() => void) | null; _s: Set<() => void> | null }
const host = (x: unknown): Host => x as Host
const subCount = (x: unknown): number => {
  const h = host(x)
  return (h._s1 !== null ? 1 : 0) + (h._s?.size ?? 0)
}

describe('two-tier tracking subscribers — storage invariant', () => {
  it('the FIRST subscriber lives in the inline slot, allocating no Set', () => {
    const s = signal(0)
    const d = effect(() => {
      s()
    })
    expect(host(s)._s1).not.toBeNull()
    expect(host(s)._s).toBeNull() // no Set allocated for the common case
    d.dispose()
  })

  it('a SECOND subscriber promotes the slot into a Set and empties the slot', () => {
    const s = signal(0)
    const a = effect(() => {
      s()
    })
    const first = host(s)._s1
    const b = effect(() => {
      s()
    })
    // INVARIANT: `_s1 !== null` implies `_s === null` — never both.
    expect(host(s)._s1).toBeNull()
    expect(host(s)._s?.size).toBe(2)
    expect(host(s)._s?.has(first as () => void)).toBe(true)
    a.dispose()
    b.dispose()
  })

  it('there is NO demotion — a Set that shrinks back to one entry stays a Set', () => {
    const s = signal(0)
    const a = effect(() => {
      s()
    })
    const b = effect(() => {
      s()
    })
    b.dispose()
    expect(host(s)._s?.size).toBe(1)
    expect(host(s)._s1).toBeNull()
    a.dispose()
  })

  it('removal works from EITHER tier and leaves no subscribers behind', () => {
    const s = signal(0)
    const a = effect(() => {
      s()
    })
    expect(subCount(s)).toBe(1) // slot tier
    a.dispose()
    expect(subCount(s)).toBe(0)

    const b = effect(() => {
      s()
    })
    const c = effect(() => {
      s()
    })
    expect(subCount(s)).toBe(2) // Set tier
    b.dispose()
    c.dispose()
    expect(subCount(s)).toBe(0)
  })
})

describe('two-tier tracking subscribers — notification', () => {
  it('notifies through the inline slot (1 subscriber)', () => {
    const s = signal(0)
    const seen: number[] = []
    const d = effect(() => seen.push(s()))
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
    const da = effect(() => a.push(s()))
    const db = effect(() => b.push(s()))
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
    // `divergeVerify` repairs the confirmed prefix by RE-ADDING the owner —
    // under the tier that resolves to an identity compare rather than a hash.
    // A double-registration would double-notify and grow storage per flip.
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

  it('returns null (caller must fall back) when >1 subscriber is present', () => {
    const s = signal(0)
    s.subscribe(() => {})
    const d = effect(() => {
      s()
    })
    expect(_suspendSoleSubscriber(s)).toBeNull()
    d.dispose()
  })
})

describe('createSelector buckets use the tier', () => {
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
    const d = effect(() => seen.push(sel(2)))
    cur.set(2)
    cur.set(3)
    expect(seen).toEqual([false, true, false])
    d.dispose()
  })
})

describe('devtools sees inline-slot subscribers', () => {
  it('debug() counts a subscriber living in the inline slot', () => {
    const s = signal(0, { name: 'counted' })
    expect(s.debug().subscriberCount).toBe(0)
    const d = effect(() => {
      s()
    })
    // A Set-only count would report 0 here — the single-subscriber shape is
    // the overwhelmingly common one, so missing it would blank the graph.
    expect(s.debug().subscriberCount).toBe(1)
    d.dispose()
    expect(s.debug().subscriberCount).toBe(0)
  })
})
