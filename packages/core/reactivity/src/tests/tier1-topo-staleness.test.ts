/**
 * Regression locks for the tier-1 topo-staleness bug (pre-existing —
 * 0.45.0-identical; NOT a #2284 regression).
 *
 * The bug: an `{ equals }` computed re-evaluated ONLY inside its queued
 * recompute and never set `_dirty` on notification. Tier-1 drains in
 * SUBSCRIPTION order, not topological order — so
 * `outer = computed(() => s() + inner(), { equals })` that subscribed to `s`
 * BEFORE `inner` drained first, pull-read `inner()` (enqueued-but-not-dirty →
 * STALE cache), and `inner`'s later re-notify of `outer` was dropped by the
 * tier-1 dedup (already visited) → `outer()` was PERMANENTLY stale (12 instead
 * of 22) until the next write — falsifying the "computeds settle before
 * effects" contract.
 *
 * The fix: (A) `{ equals }` computeds are dirty-marked at NOTIFY time and
 * evaluated by their READ's dirty branch — a tier-1 visitor that pull-reads a
 * dirty dep evaluates it in place, so subscription order stops mattering when
 * deps are dirty-at-visit; (B) the tier-1 drain clears each entry's membership
 * flag BEFORE running it, so a genuine post-visit re-dirty (reachable only
 * THROUGH a lazy intermediate whose dirtiness materializes when an upstream
 * `{ equals }` computed refreshes later in the drain) re-pushes the entry for
 * another `_dirty`-guarded sweep instead of being dropped by dedup.
 *
 * Bisect-verified: revert computed.ts's `computedWithEquals` + batch.ts's
 * tier-1 to the notify-less Set-dedup form → the permutation/cascade/mixed
 * specs fail with the exact stale values (`expected 12, got 22`-shaped);
 * restore → pass.
 */
import { batch, computed, effect, setErrorHandler, signal } from '../index'

const eq = (a: number, b: number) => a === b

describe('tier-1 topo-staleness ({ equals } computeds)', () => {
  test('outer subscribed to the source BEFORE inner settles correctly (the repro)', () => {
    const s = signal(1)
    const inner = computed(() => s() * 10, { equals: eq })
    // `outer` reads `s` FIRST, `inner` second → outer subscribes to `s` before
    // inner does (inner's first eval happens during outer's) → tier-1 visits
    // outer first.
    const outer = computed(() => s() + inner(), { equals: eq })
    let seen = -1
    effect(() => {
      seen = outer()
    })
    expect(outer()).toBe(11)

    s.set(2)

    expect(outer()).toBe(22) // was PERMANENTLY 12 (2 + stale 10) pre-fix
    expect(seen).toBe(22)
  })

  test('subscription-order permutation matrix — BOTH orders settle', () => {
    // inner-first order: inner reads s before outer ever runs.
    {
      const s = signal(1)
      const inner = computed(() => s() * 10, { equals: eq })
      inner() // inner subscribes to s FIRST
      const outer = computed(() => s() + inner(), { equals: eq })
      let seen = -1
      effect(() => {
        seen = outer()
      })
      s.set(2)
      expect(outer()).toBe(22)
      expect(seen).toBe(22)
    }
    // outer-first order (the broken permutation pre-fix).
    {
      const s = signal(1)
      const inner = computed(() => s() * 10, { equals: eq })
      const outer = computed(() => s() + inner(), { equals: eq })
      let seen = -1
      effect(() => {
        seen = outer()
      })
      s.set(2)
      expect(outer()).toBe(22)
      expect(seen).toBe(22)
    }
  })

  test('3-level eager cascade in worst subscription order settles in one write', () => {
    const s = signal(1)
    // Build DOWNSTREAM-first so tier-1 visit order is maximally anti-topological:
    // e3 subscribes to s before e2, e2 before e1.
    const e1 = computed(() => s() * 10, { equals: eq })
    const e2 = computed(() => s() + e1(), { equals: eq }) // subscribes s, then e1
    const e3 = computed(() => s() + e2(), { equals: eq }) // subscribes s, then e2
    let seen = -1
    effect(() => {
      seen = e3()
    })
    expect(e3()).toBe(1 + (1 + 10)) // 12

    s.set(2)

    expect(e1()).toBe(20)
    expect(e2()).toBe(22)
    expect(e3()).toBe(24)
    expect(seen).toBe(24)
  })

  test('post-visit re-dirty THROUGH a lazy intermediate re-runs the visited entry (the re-push half)', () => {
    // E2 (visited first) reads a LAZY intermediate L over E1. At E2's tier-1
    // visit, L is NOT yet dirty (E1 hasn't refreshed) → E2 reads L's stale
    // cache. When E1 refreshes later in the drain, its propagation dirties L,
    // whose notify re-dirties E2 — pre-fix that re-notify was dropped by the
    // tier-1 dedup (E2 already visited) → E2 permanently stale.
    const s = signal(1)
    const e2Trigger = signal(0) // makes E2 subscribe to a SOURCE before E1 exists
    const e1 = computed(() => s() * 10, { equals: eq })
    const lazyMid = computed(() => e1() + 1) // lazy — no equals
    const e2 = computed(() => e2Trigger() + lazyMid(), { equals: eq })
    // Subscription order to s: e1 only. Order in tier-1 after a batch write:
    // e2 enqueued first (via e2Trigger), e1 second.
    let seen = -1
    effect(() => {
      seen = e2()
    })
    expect(e2()).toBe(0 + 11) // 11

    batch(() => {
      e2Trigger.set(1) // enqueues e2's refresh FIRST
      s.set(2) // enqueues e1's refresh SECOND
    })

    // e2's first visit reads lazyMid stale (12); e1's later refresh dirties
    // lazyMid → re-dirties e2 → re-push → second sweep reads 21 → 22.
    expect(e2()).toBe(1 + 21) // 22 — was 12 (1 + stale 11) pre-fix
    expect(seen).toBe(22)
  })

  test('equals suppression contract still holds (no spurious downstream runs)', () => {
    const s = signal(1)
    const clamped = computed(() => Math.min(s(), 10), { equals: eq })
    let effectRuns = 0
    let directRuns = 0
    effect(() => {
      clamped()
      effectRuns++
    })
    clamped.direct(() => {
      directRuns++
    })
    expect(effectRuns).toBe(1)

    s.set(5) // 1 → 5, real change
    expect(effectRuns).toBe(2)
    expect(directRuns).toBe(1)

    s.set(11) // clamped to 10... wait: 5 → 10 is a change
    expect(effectRuns).toBe(3)
    expect(directRuns).toBe(2)

    s.set(12) // clamped to 10 — equals suppresses
    expect(effectRuns).toBe(3)
    expect(directRuns).toBe(2)
  })

  test('a torn mid-drain pull never dispatches a phantom error (eager tier-1 twin of Bug A2)', () => {
    // outer reads TWO coupled sources where the torn combination throws. With
    // dirty-at-notify + pull-reads, outer's single tier-1 eval sees BOTH
    // settled values — no torn eval, no error dispatch, no double eval.
    const errors: unknown[] = []
    setErrorHandler((err) => errors.push(err))
    try {
      const items = signal(['a', 'b', 'c'])
      const idx = computed(() => items().length - 1, { equals: eq })
      // `outer` subscribes to `items` BEFORE `idx` (reads items() first) — the
      // stale-pull order pre-fix.
      const outer = computed(() => items()[idx()]!.toUpperCase(), {
        equals: (a: string, b: string) => a === b,
      })
      let seen = ''
      effect(() => {
        seen = outer()
      })
      expect(seen).toBe('C')

      items.set(['x']) // pre-fix: outer evals with stale idx=2 → undefined.toUpperCase() throws

      expect(seen).toBe('X')
      expect(outer()).toBe('X')
      expect(errors).toEqual([])
    } finally {
      setErrorHandler(() => {})
    }
  })

  test('a drain aborted by a throwing raw listener strands a dirty { equals } computed — the next bare read self-heals', () => {
    // A raw `subscribe()` listener throws STRAIGHT THROUGH the drain (effects
    // wrap their callbacks; raw listeners do not). If an effect that ran
    // earlier in the same pass wrote a signal feeding an { equals } computed,
    // that computed's refresh sits flagged in the tier-1 queue when the drain
    // aborts — the finally resets the flag and drops the entry, leaving the
    // computed DIRTY outside any batch window. The next bare read must
    // refresh AND propagate (opening its own inline window — the read path's
    // non-batching propagate arm), not return the stale value silently.
    const s = signal(0)
    const trigger = signal(0)
    const e = computed(() => s() * 2, { equals: eq })
    e() // initialize (0)
    let directRuns = 0
    e.direct(() => {
      directRuns++
    })
    effect(() => {
      if (trigger() > 0) s.set(trigger())
    })
    trigger.subscribe(() => {
      throw new Error('raw boom')
    })

    // The effect (queued first) writes s → e is dirty-marked + its refresh
    // enqueued; the raw listener then throws → drain aborts → refresh dropped.
    expect(() => trigger.set(1)).toThrow('raw boom')
    expect((e as unknown as { _dirty: boolean })._dirty).toBe(true) // stranded

    // Bare read outside any window: refreshes, propagates via its own window.
    expect(e()).toBe(2)
    expect(directRuns).toBe(1)
    expect((e as unknown as { _dirty: boolean })._dirty).toBe(false)
  })

  test('a stranded { equals } computed with a PROMOTED direct-Set self-heals too (multi-direct arm)', () => {
    // Same stranded-drain shape as above, but with TWO direct subscribers so
    // `_d1` has been promoted into the `_d` Set — the read path's non-batching
    // propagate must iterate the Set, not just the inline slot.
    const s = signal(0)
    const trigger = signal(0)
    const e = computed(() => s() * 2, { equals: eq })
    e()
    let runsA = 0
    let runsB = 0
    e.direct(() => {
      runsA++
    })
    e.direct(() => {
      runsB++
    })
    effect(() => {
      if (trigger() > 0) s.set(trigger())
    })
    trigger.subscribe(() => {
      throw new Error('raw boom')
    })

    expect(() => trigger.set(1)).toThrow('raw boom')
    expect((e as unknown as { _dirty: boolean })._dirty).toBe(true)

    expect(e()).toBe(2)
    expect(runsA).toBe(1)
    expect(runsB).toBe(1)
  })

  test('a deep cascade past the recursion bound still enqueues a non-recompute subscriber (effect at the tail)', () => {
    // Covers the deep-defer arm's effect routing: past MAX_CASCADE_RECURSION
    // the cascade defers through the explicit stack, and a NON-recompute
    // subscriber (an effect) reached at that depth must still enqueue into
    // the effect tier — not get pushed onto the recompute stack.
    const DEPTH = 1_200 // > MAX_CASCADE_RECURSION (500)
    const head = signal(0)
    const nodes: Array<() => number> = []
    let prev: () => number = head
    for (let i = 0; i < DEPTH; i++) {
      const p = prev
      const c = computed(() => p() + 1)
      nodes.push(c)
      prev = c
    }
    // Effects subscribed across the recursion-bound BOUNDARY window (the
    // defer arm walks the subscribers of the node at the bound's exact
    // level — a small window keeps the lock robust to off-by-one in the
    // depth accounting) plus the tail.
    const seen = new Map<number, number>()
    for (const at of [497, 498, 499, 500, 501, 502, 503, DEPTH - 1]) {
      const node = nodes[at]!
      effect(() => {
        seen.set(at, node())
      })
      expect(seen.get(at)).toBe(at + 1)
    }

    head.set(1)
    for (const at of [497, 498, 499, 500, 501, 502, 503, DEPTH - 1]) {
      expect(seen.get(at)).toBe(at + 2)
    }
  })

  test('a raw out-of-window notify dispatch still refreshes synchronously (external-caller arm)', () => {
    // White-box: every in-tree notify runs under a write's batch window; a raw
    // external caller invoking a subscriber directly (no window) must not
    // strand the computed — the notify opens its own window so the refresh +
    // propagation complete before the dispatch returns.
    const s = signal(1)
    const e = computed(() => s() * 2, { equals: eq })
    let seen = -1
    effect(() => {
      seen = e()
    })
    expect(seen).toBe(2)

    // Mutate the raw value WITHOUT notification, then dispatch the subscriber
    // set manually, outside any batch window — the raw-external-caller shape.
    ;(s as unknown as { _v: number })._v = 5
    const subs = (s as unknown as { _s: Set<() => void> })._s
    for (const sub of [...subs]) sub()

    expect(e()).toBe(10)
    expect(seen).toBe(10)
  })

  test('effects always read settled { equals } computeds regardless of subscription order (the doc claim)', () => {
    // The "computeds settle before effects" contract, in its previously-
    // falsified shape: the effect subscribes to the source FIRST, then to the
    // eager computed — and still must observe the settled derived value.
    const s = signal(1)
    const derived = computed(() => s() * 100, { equals: eq })
    const pairs: Array<[number, number]> = []
    effect(() => {
      // Reads s first → the effect subscribes to the source before the eager
      // computed; tier-1 (refresh) must still fully precede tier-2 (this run).
      pairs.push([s(), derived()])
    })
    s.set(2)
    s.set(3)
    expect(pairs).toEqual([
      [1, 100],
      [2, 200],
      [3, 300],
    ])
  })
})
