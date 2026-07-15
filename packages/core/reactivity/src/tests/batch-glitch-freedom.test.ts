/**
 * Regression locks for the #2284/#2296 lazy-computed inline-propagation
 * behavioral regressions vs 0.45.0 (fixed by deferring a lazy computed's
 * DIRECT-subscriber dispatch to the batch drain + an ITERATIVE dirty cascade).
 *
 * Bug A — batch() glitch-freedom for computed DIRECT bindings. A lazy
 * computed's `recompute` runs INLINE during a write's notify phase; firing its
 * `_d1`/`_d` direct subscriber (the compiled `{someComputed()}`
 * `_bindText`/`_bindDirect` shape) there read a TORN mid-batch value and
 * re-fired on each write. On main: `[12, 30]` instead of one settled `[30]`;
 * a torn eval that THROWS even dispatched a phantom production error through
 * `_errorHandler`.
 *
 * Bug B — recursive write-time dirty DFS overflowed the JS stack on a deep
 * chain (~8000+). The RangeError was caught by the read-path try/catch, which
 * cleared `_dirty` with a STALE value → a silent lost update. 0.45.0 propagated
 * iteratively and was correct at 10,000.
 *
 * Bisect-verified: revert computed.ts's recompute to fire `read._d1()` inline
 * (and revert batch.ts's iterative `propagateLazyDirty` to the recursive form)
 * → Bug A fires `[12, 30]` with 1 error dispatch, and Bug B reads 10000 (stale)
 * with 1 error dispatch. Restore → both pass.
 */
import { batch, computed, setErrorHandler, signal } from '../index'

describe('batch() glitch-freedom for computed direct bindings (Bug A)', () => {
  test('computed .direct under a multi-write batch fires EXACTLY once with the settled value', () => {
    const a = signal(1)
    const b = signal(2)
    const sum = computed(() => a() + b())
    sum() // initialize

    const fires: number[] = []
    sum.direct(() => {
      // Read the cached value the compiler-emitted binding reads (`_v`).
      fires.push((sum as unknown as { _v: number })._v)
    })

    batch(() => {
      a.set(10)
      b.set(20)
    })

    // Exactly ONE fire, with the fully-settled value — never a torn [12, 30].
    expect(fires).toEqual([30])
  })

  test('a torn intermediate that WOULD throw never dispatches a phantom error', () => {
    const errors: unknown[] = []
    setErrorHandler((err) => errors.push(err))
    try {
      const items = signal(['a', 'b', 'c'])
      const idx = signal(2)
      // Mid-batch (items updated, idx not yet) this reads items()[2] === undefined
      // → `.toUpperCase()` throws. The direct subscriber must NOT observe that
      // torn state.
      const name = computed(() => items()[idx()]!.toUpperCase())
      name() // initialize → 'C'

      const fires: string[] = []
      name.direct(() => {
        fires.push((name as unknown as { _v: string })._v)
      })

      batch(() => {
        items.set(['x'])
        idx.set(0)
      })

      expect(fires).toEqual(['X'])
      expect(errors).toEqual([]) // zero phantom error-handler dispatches
    } finally {
      setErrorHandler(() => {})
    }
  })

  test('a genuine settled-state throw STILL surfaces (deferral does not swallow real errors)', () => {
    const errors: unknown[] = []
    setErrorHandler((err) => errors.push(err))
    try {
      const items = signal(['a'])
      const idx = signal(0)
      const name = computed(() => items()[idx()]!.toUpperCase())
      name() // 'A'
      name.direct(() => {
        // touch _v so the deferred dispatch pull-reads the (throwing) computed
        void (name as unknown as { _v: string })._v
      })

      // Settled state genuinely out of bounds → the drain-time recompute throws
      // for real. It must reach _errorHandler.
      idx.set(5)

      expect(errors.length).toBe(1)
      expect((errors[0] as Error).message).toMatch(/undefined|toUpperCase/)
    } finally {
      setErrorHandler(() => {})
    }
  })

  test('unbatched single write still fires the direct subscriber synchronously', () => {
    const s = signal(1)
    const doubled = computed(() => s() * 2)
    doubled()
    let called = 0
    doubled.direct(() => {
      called++
    })
    s.set(2)
    expect(called).toBe(1) // deferral drains synchronously within set()
    expect((doubled as unknown as { _v: number })._v).toBe(4)
  })
})

describe('iterative deep-chain dirty cascade (Bug B)', () => {
  test('a depth-10,000 chain with a direct tail subscriber settles correctly, no overflow', () => {
    // The WRITE-time dirty cascade is the target: on main it recursed
    // (`propagateLazyDirty → recompute → …`) and overflowed the JS stack at a
    // deep chain; the caught RangeError left a computed `_dirty`-cleared with a
    // STALE value (silent lost update). The fix makes that cascade ITERATIVE.
    //
    // NOTE on the read side: a lazy chain's PULL-READ is inherently recursive
    // (evaluating a deep dirty chain recurses through each user closure — the
    // same shape in 0.45.0). To keep this lock robust (not JIT-timing-fragile
    // near the stack ceiling), we build clean state by reading BOTTOM-UP once
    // (each read is O(1)-shallow because its dep is already clean), which also
    // warms the read code path. The direct subscriber's drain-time read of the
    // tail then fits within the `--stack-size` headroom this suite configures
    // (matching the standalone environment where 0.45.0 was "correct at 10k").
    const errors: unknown[] = []
    setErrorHandler((err) => errors.push(err))
    try {
      const DEPTH = 10_000
      const head = signal(0)
      const nodes: Array<() => number> = []
      let prev: () => number = head
      for (let i = 0; i < DEPTH; i++) {
        const p = prev
        const c = computed(() => p() + 1)
        nodes.push(c)
        prev = c
      }
      // Establish clean state + warm the read path — each read is shallow
      // because the previous node is already clean.
      for (const n of nodes) n()
      const tail = nodes[DEPTH - 1] as unknown as (() => number) & {
        _v: number
        direct(fn: () => void): () => void
      }
      expect(tail()).toBe(DEPTH) // 0 + 10_000

      let directValue = -1
      tail.direct(() => {
        directValue = tail._v
      })

      // On main: the recursive DFS overflows → caught RangeError → the tail is
      // left `_dirty`-cleared with the STALE 10_000. The iterative cascade here
      // marks the whole chain dirty without recursion.
      head.set(1)

      expect(tail()).toBe(DEPTH + 1) // 1 + 10_000, correct — not the stale 10_000
      expect(directValue).toBe(DEPTH + 1) // the deferred direct dispatch read the settled value
      expect(errors).toEqual([]) // no overflow → no error dispatch
    } finally {
      setErrorHandler(() => {})
    }
  })

  test('a depth-10,000 cascade WITHOUT a subscriber never overflows (pure iterative dirty-mark)', () => {
    // Isolates the write-time cascade from any deep read: build + read
    // bottom-up (shallow), write, read bottom-up again (shallow). The only
    // deep operation is the `head.set` dirty cascade itself — recursive on
    // main (overflows, uncaught), iterative here.
    const errors: unknown[] = []
    setErrorHandler((err) => errors.push(err))
    try {
      const DEPTH = 10_000
      const head = signal(0)
      const nodes: Array<() => number> = []
      let prev: () => number = head
      for (let i = 0; i < DEPTH; i++) {
        const p = prev
        const c = computed(() => p() + 1)
        nodes.push(c)
        prev = c
      }
      for (const n of nodes) n() // clean state, all shallow
      head.set(1) // pure dirty-mark cascade — recursive on main → overflow
      for (const n of nodes) n() // re-read bottom-up, all shallow
      expect(nodes[DEPTH - 1]!()).toBe(DEPTH + 1)
      expect(errors).toEqual([])
    } finally {
      setErrorHandler(() => {})
    }
  })
})

describe('lazy-cascade purity is preserved (#2284/#2296 property)', () => {
  test('a pure lazy diamond stays pull-lazy and recomputes the apex exactly once (no queue, no double-fire)', () => {
    let apexRuns = 0
    const a = signal(1)
    const b = computed(() => a() + 1)
    const c = computed(() => a() + 2)
    const apex = computed(() => {
      apexRuns++
      return b() + c()
    })
    expect(apex()).toBe(5) // init: 2 + 3
    expect(apexRuns).toBe(1)

    // Pure cascade — no effect/direct subscriber anywhere. A write must NOT
    // eagerly re-evaluate (it only dirty-marks) and must NOT enqueue anything
    // into the effect queue.
    a.set(10)
    expect(apexRuns).toBe(1) // still lazy — no eager recompute on write

    // Read pull-recomputes the apex EXACTLY once despite two dirty paths
    // (b and c both reach apex) — the diamond dedup via the `_dirty` guard.
    expect(apex()).toBe(23) // 11 + 12
    expect(apexRuns).toBe(2)
  })

  test('a pure lazy deep chain stays pull-lazy (no per-hop eager recompute on write)', () => {
    let tailRuns = 0
    const head = signal(0)
    let prev: () => number = head
    for (let i = 0; i < 200; i++) {
      const p = prev
      prev = computed(() => p() + 1)
    }
    const almostTail = prev
    const tail = computed(() => {
      tailRuns++
      return almostTail()
    })
    expect(tail()).toBe(200)
    expect(tailRuns).toBe(1)

    head.set(1)
    // Write-time cascade is dirty-marking only — the tail is not eagerly re-run.
    expect(tailRuns).toBe(1)
    expect(tail()).toBe(201) // pull on read
    expect(tailRuns).toBe(2)
  })
})
