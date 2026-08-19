// Contract lock for the DEFAULT value gate on `computed(fn)` (no `equals`).
//
// Two properties have to hold SIMULTANEOUSLY, and it is the combination that is
// the design — either one alone is easy and was already available:
//
//   1. A computed whose recomputed value is `Object.is`-equal to its previous
//      value does NOT notify downstream. (Was opt-in via `{ equals }`.)
//   2. A computed nobody is listening to still evaluates ZERO times across any
//      number of dependency writes. (Was forfeited by `{ equals }`, which
//      re-evaluated eagerly on every notification.)
//
// The mechanism: the dirty cascade stays lazy until it reaches a RUNNER (an
// effect notify, a raw listener, or a `direct()` updater), at which point the
// computed immediately above books a tier-1 refresh whose gate decides whether
// that runner fires at all. See `createComputed` in computed.ts and
// `propagateLazyDirty`'s `owner` parameter in batch.ts.

import { describe, expect, test } from 'vitest'
import { batch } from '../batch'
import { computed } from '../computed'
import { effect } from '../effect'
import { signal } from '../signal'

describe('computed — default value gate', () => {
  test('an unchanged derived value does NOT re-run a subscribed effect', () => {
    const n = signal(0)
    const bucket = computed(() => Math.floor(n() / 10))

    let runs = 0
    const eff = effect(() => {
      bucket()
      runs++
    })
    expect(runs).toBe(1)

    // Same bucket → gated.
    n.set(1)
    n.set(2)
    n.set(9)
    expect(runs).toBe(1)

    // Crossing the bucket boundary → a real change propagates.
    n.set(10)
    expect(runs).toBe(2)

    eff.dispose()
  })

  test('the memoization wall: one blocked write runs ONE evaluation and ZERO of 300 consumers', () => {
    const n = signal(0)
    let evals = 0
    const derived = computed(() => {
      evals++
      return Math.floor(n() / 1000)
    })

    let consumerRuns = 0
    const disposers = Array.from({ length: 300 }, () =>
      effect(() => {
        derived()
        consumerRuns++
      }),
    )
    expect(consumerRuns).toBe(300)
    const evalsAfterMount = evals

    n.set(1) // same bucket
    expect(evals - evalsAfterMount).toBe(1) // the gate's own single evaluation
    expect(consumerRuns).toBe(300) // …and nothing downstream ran

    n.set(1000) // real change
    expect(consumerRuns).toBe(600)

    for (const d of disposers) d.dispose()
  })

  test('a change still propagates through a deep chain', () => {
    const n = signal(1)
    const a = computed(() => n() * 2)
    const b = computed(() => a() + 1)
    const c = computed(() => b() * 10)

    const seen: number[] = []
    const eff = effect(() => {
      seen.push(c())
    })
    expect(seen).toEqual([30])

    n.set(2)
    expect(seen).toEqual([30, 50])

    eff.dispose()
  })

  test('the gate lands on the computed IMMEDIATELY above the runner, and costs no extra evaluations', () => {
    const n = signal(0)
    let bEvals = 0
    let cEvals = 0
    const b = computed(() => {
      bEvals++
      return Math.floor(n() / 10) // repeats for n = 0..9
    })
    const c = computed(() => {
      cEvals++
      return b() * 100
    })

    let runs = 0
    const eff = effect(() => {
      c()
      runs++
    })
    const bBase = bEvals
    const cBase = cEvals

    n.set(1)
    n.set(2)
    // `c` is the node directly above the runner, so `c` is the one that refreshes
    // and gates; its evaluation pulls `b` exactly as the effect's own read would
    // have. So the chain costs the SAME evaluations it costs today — the saving
    // is the effect body, which no longer runs at all.
    expect(cEvals - cBase).toBe(2)
    expect(bEvals - bBase).toBe(2)
    expect(runs).toBe(1)

    // A real change propagates normally.
    n.set(10)
    expect(cEvals - cBase).toBe(3)
    expect(runs).toBe(2)

    eff.dispose()
  })
})

describe('computed — laziness is preserved by the gate', () => {
  // NOTE: these read ONCE up front on purpose. A computed that has never been
  // read has no dependency edges at all (it subscribes on first evaluation), so
  // it cannot evaluate on a write whatever the propagation mode — asserting zero
  // evaluations on a never-read computed proves nothing. Reading first builds the
  // edges, which is what makes the assertion load-bearing.
  test('a SUBSCRIBED-but-unlistened computed evaluates ZERO times across many writes', () => {
    const n = signal(0)
    let evals = 0
    const c = computed(() => {
      evals++
      return n() * 2
    })

    expect(c()).toBe(0) // establishes the edge n -> c
    expect(evals).toBe(1)

    for (let i = 1; i <= 20; i++) n.set(i)
    expect(evals).toBe(1) // nobody is listening — no evaluation at all

    // The pull is the only thing that evaluates, and it coalesces all 20 writes.
    expect(c()).toBe(40)
    expect(evals).toBe(2)
  })

  test('a chain of unlistened computeds evaluates ZERO times across many writes', () => {
    const n = signal(0)
    let evals = 0
    const a = computed(() => {
      evals++
      return n() + 1
    })
    const b = computed(() => {
      evals++
      return a() + 1
    })
    const c = computed(() => {
      evals++
      return b() + 1
    })

    expect(c()).toBe(3) // builds n -> a -> b -> c
    expect(evals).toBe(3)

    for (let i = 1; i <= 20; i++) n.set(i)
    expect(evals).toBe(3) // the whole chain stays dormant

    expect(c()).toBe(23)
    expect(evals).toBe(6)
  })

  test('an EXPLICIT `{ equals }` stays EAGER — the author placed the gate at that node', () => {
    // Unchanged contract, and load-bearing: `@pyreon/flow`'s `_edgeById` passes
    // `{ equals: Object.is }` precisely so the cascade dies THERE, above an edge-
    // geometry computed that rebuilds a fresh object and could therefore never
    // gate on its own. Demoting an explicit gate to the runner boundary would
    // re-run every unmoved edge's geometry on every drag frame.
    const n = signal(0)
    let evals = 0
    const c = computed(
      () => {
        evals++
        return n() * 2
      },
      { equals: Object.is },
    )

    expect(c()).toBe(0)
    for (let i = 1; i <= 20; i++) n.set(i)
    expect(evals).toBe(21) // one per dependency change — the documented trade
  })

  test('a computed goes lazy again once its last runner unsubscribes', () => {
    const n = signal(0)
    let evals = 0
    const c = computed(() => {
      evals++
      return n() * 2
    })

    const eff = effect(() => {
      c()
    })
    n.set(1)
    const whileHot = evals
    expect(whileHot).toBeGreaterThan(0)

    eff.dispose()
    for (let i = 2; i <= 10; i++) n.set(i)
    expect(evals).toBe(whileHot) // cold again — no evaluations at all
  })
})

describe('computed — the gate holds the documented propagation invariants', () => {
  test('a multi-write batch settles to a SINGLE effect run on the final value', () => {
    const a = signal(1)
    const b = signal(2)
    const sum = computed(() => a() + b())

    const seen: number[] = []
    const eff = effect(() => {
      seen.push(sum())
    })
    expect(seen).toEqual([3])

    batch(() => {
      a.set(10)
      b.set(20)
    })
    expect(seen).toEqual([3, 30]) // one fire, on the settled value — no torn 12

    eff.dispose()
  })

  test('a batch whose writes cancel out fires NOTHING', () => {
    const a = signal(1)
    const b = signal(10)
    const sum = computed(() => a() + b())

    let runs = 0
    const eff = effect(() => {
      sum()
      runs++
    })
    expect(runs).toBe(1)

    batch(() => {
      a.set(5) // sum would be 15…
      b.set(6) // …but settles back to 11
    })
    expect(runs).toBe(1)

    eff.dispose()
  })

  test('a diamond runs its effect once per real change', () => {
    const n = signal(1)
    const left = computed(() => n() * 2)
    const right = computed(() => n() * 3)
    const join = computed(() => left() + right())

    let runs = 0
    const seen: number[] = []
    const eff = effect(() => {
      seen.push(join())
      runs++
    })
    expect(runs).toBe(1)

    n.set(2)
    expect(runs).toBe(2)
    expect(seen).toEqual([5, 10])

    eff.dispose()
  })

  test('a direct() updater is gated on value and stays deferred to the drain', () => {
    const n = signal(0)
    const bucket = computed(() => Math.floor(n() / 10))

    const fires: number[] = []
    const stop = bucket.direct(() => fires.push(bucket._v))
    // Prime the cache the way a compiler-emitted binding does.
    expect(bucket._v).toBe(0)

    n.set(1)
    n.set(2)
    expect(fires).toEqual([]) // unchanged value → no redundant DOM write

    n.set(10)
    expect(fires).toEqual([1])

    // Glitch-freedom: a multi-write batch delivers ONE fire, on the settled value.
    batch(() => {
      n.set(20)
      n.set(30)
    })
    expect(fires).toEqual([1, 3])

    stop()
  })

  test('a custom `equals` still overrides the default comparator', () => {
    const n = signal(0)
    const c = computed(() => n(), { equals: (a, b) => Math.floor(a / 10) === Math.floor(b / 10) })

    let runs = 0
    const eff = effect(() => {
      c()
      runs++
    })

    n.set(5) // Object.is says changed, the custom comparator says equal
    expect(runs).toBe(1)

    n.set(15)
    expect(runs).toBe(2)

    eff.dispose()
  })

  test('NaN is gated (Object.is semantics, not ===)', () => {
    const n = signal(0)
    const c = computed(() => {
      // Depend on `n` — the point of the test is that the computed RE-EVALUATES
      // on every write and still gates, because `Object.is(NaN, NaN)` is true
      // where `NaN === NaN` is false. Written as an explicit read plus a literal
      // rather than `n() / 0 - n() / 0`: that produced NaN for every `n` too,
      // but as a self-subtraction it reads as a mistake and CodeQL flags it as
      // identical operands. Same semantics, stated outright.
      n()
      return Number.NaN
    })

    let runs = 0
    const eff = effect(() => {
      c()
      runs++
    })
    expect(runs).toBe(1)

    n.set(1)
    n.set(2)
    expect(runs).toBe(1) // NaN vs NaN — Object.is is true, `===` would not be

    eff.dispose()
  })

  test('the gate holds past MAX_CASCADE_RECURSION, where the cascade defers to an explicit stack', () => {
    // `propagateLazyDirty` recurses inline through fan-out levels only while
    // shallow; past MAX_CASCADE_RECURSION (500) it defers every lazy branch to
    // `_lazyDirtyStack` so the live JS stack stays bounded. Build exactly 500
    // fan-out LEVELS — each node has two subscribers, one dead-end and one that
    // carries the chain on, so the structure is linear in nodes but 500 deep in
    // levels. Node_k's fan-out runs at cascade depth k, and each deferred window
    // restarts at depth 0, so the runner has to sit at level 500 precisely for
    // the deep-defer arm to be the one that sees it.
    const LEVELS = 500
    const src = signal(0)
    const deadEnds: Array<() => number> = []
    let cur: () => number = computed(() => Math.floor(src() / 1000))

    for (let i = 0; i < LEVELS; i++) {
      const prev = cur
      deadEnds.push(computed(() => prev() + 1))
      cur = computed(() => prev() + 1)
    }
    // A dead-end sibling at the tail too, so the deepest level is a FAN-OUT that
    // contains a runner — the branch that has to gate rather than enqueue.
    const tail = cur
    deadEnds.push(computed(() => tail() + 1))

    // Reading is what establishes the dependency edges.
    for (const d of deadEnds) d()

    let runs = 0
    const eff = effect(() => {
      tail()
      runs++
    })
    expect(runs).toBe(1)

    // Same bucket → the whole 600-level cascade must still resolve to "no change"
    // and leave the effect alone, without overflowing the JS stack.
    expect(() => src.set(1)).not.toThrow()
    expect(runs).toBe(1)

    // A real change still propagates the full depth.
    src.set(1000)
    expect(runs).toBe(2)
    expect(tail()).toBe(LEVELS + 1)

    eff.dispose()
  })

  test('a fresh reference is NOT gated — object identity is the comparator', () => {
    const n = signal(0)
    const c = computed(() => ({ bucket: Math.floor(n() / 10) }))

    let runs = 0
    const eff = effect(() => {
      c()
      runs++
    })

    n.set(1) // same contents, new object → still notifies
    expect(runs).toBe(2)

    eff.dispose()
  })
})
