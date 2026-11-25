/**
 * Regression locks for the tier-1 topo-staleness bug of the pre-graph core
 * (0.45.0-identical; NOT a #2284 regression).
 *
 * The bug: an `{ equals }` computed was refreshed from a queue drained in
 * SUBSCRIPTION order, not topological order, so
 * `outer = computed(() => s() + inner(), { equals })` subscribed to `s` BEFORE
 * `inner` could pull a stale `inner` and stay PERMANENTLY stale (12 instead of
 * 22) until the next write — falsifying "computeds settle before effects".
 *
 * Since stage (ii) of the reactivity redesign there is no refresh queue: a
 * write only marks, and every read of a marked computed resolves its
 * dependencies bottom-up first, so subscription order cannot matter. These
 * specs keep pinning the observable contract (settled values, run counts, no
 * phantom errors, no stranded marks) in the orders that broke it.
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

  test('a throwing raw listener on the trigger does not strand an { equals } computed (one direct entry)', () => {
    // A `subscribe()` listener sits in the trigger's direct tier and fires
    // first. It throws, but the write had already marked the effect, so the
    // window's close still flushes it: the effect writes `s`, `e` changes and
    // its direct updater fires once — all before the throw leaves `set()`.
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

    expect(() => trigger.set(1)).toThrow('raw boom')
    expect(directRuns).toBe(1)
    expect(e()).toBe(2)
    expect(directRuns).toBe(1)
  })

  test('same with two direct updaters on the computed (the Set arm)', () => {
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
