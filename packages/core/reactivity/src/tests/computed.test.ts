import { computed } from '../computed'
import { effect } from '../effect'
import { signal } from '../signal'

describe('computed', () => {
  test('computes derived value', () => {
    const s = signal(2)
    const doubled = computed(() => s() * 2)
    expect(doubled()).toBe(4)
  })

  test('updates when dependency changes', () => {
    const s = signal(3)
    const tripled = computed(() => s() * 3)
    expect(tripled()).toBe(9)
    s.set(4)
    expect(tripled()).toBe(12)
  })

  test('is lazy — does not compute until read', () => {
    let computations = 0
    const s = signal(0)
    const c = computed(() => {
      computations++
      return s() + 1
    })
    expect(computations).toBe(0)
    c() // first read
    expect(computations).toBe(1)
  })

  test('is memoized — does not recompute on repeated reads', () => {
    let computations = 0
    const s = signal(5)
    const c = computed(() => {
      computations++
      return s() * 2
    })
    c()
    c()
    c()
    expect(computations).toBe(1)
  })

  test('recomputes only when dirty', () => {
    let computations = 0
    const s = signal(1)
    const c = computed(() => {
      computations++
      return s()
    })
    c()
    expect(computations).toBe(1)
    s.set(2)
    c()
    expect(computations).toBe(2)
    c()
    expect(computations).toBe(2) // still memoized
  })

  test('chains correctly', () => {
    const base = signal(2)
    const doubled = computed(() => base() * 2)
    const quadrupled = computed(() => doubled() * 2)
    expect(quadrupled()).toBe(8)
    base.set(3)
    expect(quadrupled()).toBe(12)
  })

  test('dispose stops recomputation', () => {
    const s = signal(1)
    let computations = 0
    const c = computed(() => {
      computations++
      return s() * 2
    })
    c() // initial
    expect(computations).toBe(1)
    c.dispose()
    s.set(2)
    // After dispose, reading returns stale value and does not recompute
    // (the computed is no longer subscribed to s)
  })

  test('custom equals skips downstream notification when equal', () => {
    const s = signal(3)
    let downstream = 0

    const c = computed(() => Math.floor(s() / 10), {
      equals: (a, b) => a === b,
    })

    effect(() => {
      c()
      downstream++
    })

    expect(downstream).toBe(1)
    expect(c()).toBe(0)

    s.set(5) // Math.floor(5/10) = 0, same as before
    expect(downstream).toBe(1) // no downstream update

    s.set(15) // Math.floor(15/10) = 1, different
    expect(downstream).toBe(2)
    expect(c()).toBe(1)
  })

  test('custom equals with array comparison', () => {
    const items = signal([1, 2, 3])
    let downstream = 0

    const sorted = computed(() => items().slice().sort(), {
      equals: (a, b) => a.length === b.length && a.every((v, i) => v === b[i]),
    })

    effect(() => {
      sorted()
      downstream++
    })

    expect(downstream).toBe(1)

    // Set to same content in different array — equals returns true, no notification
    items.set([1, 2, 3])
    expect(downstream).toBe(1)

    // Actually different content
    items.set([1, 2, 4])
    expect(downstream).toBe(2)
  })

  test('computed used as dependency inside an effect (subscribe path)', () => {
    const s = signal(10)
    const c = computed(() => s() + 1)
    let result = 0

    effect(() => {
      result = c()
    })

    expect(result).toBe(11)
    s.set(20)
    expect(result).toBe(21)
  })

  test('._v returns cached value', () => {
    const s = signal(5)
    const doubled = computed(() => s() * 2)
    // First access triggers computation
    expect(doubled._v).toBe(10)
    s.set(7)
    // _v triggers recompute when dirty
    expect(doubled._v).toBe(14)
  })

  test('.direct() fires updater on recompute', () => {
    const s = signal(1)
    const doubled = computed(() => s() * 2)
    doubled() // initialize

    let called = 0
    const dispose = doubled.direct(() => {
      called++
    })

    s.set(2)
    expect(called).toBe(1)
    expect(doubled._v).toBe(4)

    s.set(3)
    expect(called).toBe(2)

    dispose()
    s.set(4)
    expect(called).toBe(2) // disposed, no more calls
  })

  test('.direct() works with equals option', () => {
    const s = signal(1)
    const clamped = computed(() => Math.min(s(), 10), {
      equals: (a, b) => a === b,
    })
    clamped() // initialize

    let called = 0
    clamped.direct(() => {
      called++
    })

    s.set(5)
    expect(called).toBe(1)

    // Same clamped result — equals returns true, no notification
    s.set(10)
    expect(called).toBe(2)
    s.set(11) // clamped to 10, same as before
    expect(called).toBe(2) // equals suppresses
  })

  test('.direct() registrations do not accumulate under churn (bounded, like signal._d)', () => {
    // Regression for the never-compacted-array leak: a long-lived
    // computed whose direct updaters register+dispose repeatedly (e.g.
    // <For> rows re-mounting) must keep its live set bounded to LIVE
    // registrations, not grow one permanent dead slot per ever-
    // registered binding (which also made `recompute` O(total-ever)).
    //
    // After PR #1177 + #4: two-tier storage on computed mirrors signal —
    // single subscriber lives in `_d1` inline slot (Set not allocated).
    const s = signal(0)
    const c = computed(() => s() * 2)
    c() // initialize
    const internal = c as unknown as {
      _d: Set<() => void> | null
      _d1: (() => void) | null
    }

    for (let i = 0; i < 10_000; i++) {
      const dispose = c.direct(() => {})
      dispose()
    }
    // No Set ever allocated — churn stays on the inline-slot tier.
    expect(internal._d).toBeNull()
    expect(internal._d1).toBeNull()

    // One live binding survives in the inline slot.
    let fired = 0
    const dispose = c.direct(() => {
      fired++
    })
    expect(internal._d1).not.toBeNull()
    expect(internal._d).toBeNull()
    s.set(1)
    expect(fired).toBe(1)
    dispose()
    expect(internal._d1).toBeNull()
    s.set(2)
    expect(fired).toBe(1) // disposed updater not invoked
  })

  describe('_v with equals after disposal', () => {
    test('_v returns last cached value after dispose()', () => {
      const s = signal(5)
      const doubled = computed(() => s() * 2)
      expect(doubled._v).toBe(10) // triggers initial computation

      s.set(7)
      expect(doubled._v).toBe(14) // recomputes

      doubled.dispose()
      s.set(100)
      // After dispose, _v returns the last cached value (14)
      // because dirty flag is not set (no subscription) and the
      // disposed guard prevents recomputation
      expect(doubled._v).toBe(14)
    })

    test('computed with equals: _v only updates when equality check fails', () => {
      const s = signal(3)
      const floored = computed(() => Math.floor(s() / 10), {
        equals: (a, b) => a === b,
      })

      expect(floored._v).toBe(0) // Math.floor(3/10) = 0

      s.set(5) // Math.floor(5/10) = 0, same
      expect(floored._v).toBe(0)

      s.set(15) // Math.floor(15/10) = 1, different
      expect(floored._v).toBe(1)

      s.set(19) // Math.floor(19/10) = 1, same
      expect(floored._v).toBe(1)
    })

    test('multiple .direct() updaters on computed, dispose one', () => {
      const s = signal(1)
      const doubled = computed(() => s() * 2)
      doubled() // initialize

      let calls1 = 0
      let calls2 = 0
      let calls3 = 0

      const dispose1 = doubled.direct(() => {
        calls1++
      })
      doubled.direct(() => {
        calls2++
      })
      doubled.direct(() => {
        calls3++
      })

      s.set(2)
      expect(calls1).toBe(1)
      expect(calls2).toBe(1)
      expect(calls3).toBe(1)

      dispose1()
      // Read to reset dirty flag so next change triggers recompute notification
      doubled()
      s.set(3)
      expect(calls1).toBe(1) // disposed
      expect(calls2).toBe(2) // still active
      expect(calls3).toBe(2) // still active
    })

    test('promotes from inline slot to Set on second subscriber (mirrors signal)', () => {
      // Computed's direct mirrors signal's PR #1177 two-tier shape:
      // first subscriber lives in `_d1` inline slot; 2nd subscribe
      // promotes both into a `_d` Set. Subsequent subscribes use Set.
      const s = signal(1)
      const c = computed(() => s() * 2)
      c() // initialize
      const internal = c as unknown as {
        _d: Set<() => void> | null
        _d1: (() => void) | null
      }

      const dispose1 = c.direct(() => {})
      expect(internal._d).toBeNull()
      expect(internal._d1).not.toBeNull()

      const dispose2 = c.direct(() => {})
      // Promotion — _d1 cleared, _d Set has both updaters
      expect(internal._d1).toBeNull()
      expect(internal._d).not.toBeNull()
      expect(internal._d!.size).toBe(2)

      // Dispose first (the original inline-slot subscriber, now in _d).
      // Disposer must be promotion-aware: cleared `_d1` no longer holds it.
      dispose1()
      expect(internal._d!.size).toBe(1)
      dispose2()
      expect(internal._d!.size).toBe(0)
    })
  })

  describe('diamond pattern cleanup', () => {
    test('a -> b, c -> d diamond: d only recomputes once per a change', () => {
      const a = signal(1)
      const b = computed(() => a() + 1)
      const c = computed(() => a() + 2)

      let dComputations = 0
      const d = computed(() => {
        dComputations++
        return b() + c()
      })

      expect(d()).toBe(5) // b=2 + c=3
      expect(dComputations).toBe(1)

      a.set(2) // b=3, c=4
      expect(d()).toBe(7)
      // d should only recompute once (lazy evaluation avoids double recompute)
      expect(dComputations).toBe(2)
    })

    test('dispose middle node in diamond, verify no stale subscriptions', () => {
      const a = signal(1)
      const b = computed(() => a() * 2)
      const c = computed(() => a() * 3)

      let dRuns = 0
      const d = computed(() => {
        dRuns++
        return b() + c()
      })

      expect(d()).toBe(5) // b=2 + c=3
      expect(dRuns).toBe(1)

      // Dispose b — it will no longer recompute from a
      b.dispose()

      a.set(2)
      // d still recomputes because c changed, but b returns stale value (2)
      expect(d()).toBe(8) // b=2 (stale) + c=6
      expect(dRuns).toBe(2)

      // Verify a no longer notifies b's subscribers
      a.set(3)
      expect(d()).toBe(11) // b=2 (still stale) + c=9
      expect(dRuns).toBe(3)
    })
  })

  // ─── Audit bug #1 (extension): async computed warning ─────────────────
  describe('async function warning', () => {
    test('warns when called with an async arrow function', () => {
      const warns: string[] = []
      const orig = console.warn
      console.warn = (...args: unknown[]) => warns.push(args.join(' '))
      try {
        const asyncFn = async (): Promise<number> => 42
        // Cast through `unknown` because async is intentionally NOT in
        // computed()'s type signature — that's the point. The runtime
        // warn catches what the type system would normally reject.
        computed(asyncFn as unknown as () => number)
      } finally {
        console.warn = orig
      }
      expect(warns.some((m) => m.includes('computed'))).toBe(true)
      expect(warns.some((m) => m.includes('createResource'))).toBe(true)
    })

    test('does NOT warn for synchronous computed callbacks', () => {
      const warns: string[] = []
      const orig = console.warn
      console.warn = (...args: unknown[]) => warns.push(args.join(' '))
      try {
        computed(() => 42)
      } finally {
        console.warn = orig
      }
      expect(warns.some((m) => m.includes('async function'))).toBe(false)
    })
  })

  // M6 audit gap (c): creating a computed inside another computed's recompute
  // body. Edge case — the inner computed registers its `recompute` as a
  // signal subscriber DURING the outer's evaluation. The new computed should
  // track the outer's source dependency correctly and not crash the recompute.
  describe('computed-in-computed recompute (regression)', () => {
    test('creating a computed inside a computed body is safe and tracks correctly', () => {
      const source = signal(1)
      let innerCreated = 0

      // Outer computed creates a new computed each time it runs.
      const outer = computed(() => {
        const v = source()
        innerCreated++
        const inner = computed(() => v * 2)
        return inner()
      })

      // First read — outer creates inner #1, returns 2.
      expect(outer()).toBe(2)
      expect(innerCreated).toBe(1)

      // Source change — outer recomputes, creates inner #2, returns 4.
      source.set(2)
      expect(outer()).toBe(4)
      expect(innerCreated).toBe(2)

      // Verify the previously-created inner computeds didn't capture stale
      // tracking — the latest outer() value reflects the latest source.
      source.set(10)
      expect(outer()).toBe(20)
      expect(innerCreated).toBe(3)
    })

    test('inner computed reads outer source signal — no double-track or recompute leak', () => {
      const source = signal(1)
      let outerRuns = 0

      const outer = computed(() => {
        outerRuns++
        const v = source()
        // Inner reads the same source — should not double-subscribe outer.
        const inner = computed(() => source() + v)
        return inner()
      })

      expect(outer()).toBe(2)
      expect(outerRuns).toBe(1)

      source.set(5)
      expect(outer()).toBe(10)
      expect(outerRuns).toBe(2) // not 3 or more (no double-fire)
    })
  })

  describe('memory shape — prototype + plain fields (perf optimization lock)', () => {
    // Locks the ~45%-smaller computed shape (PR perf/computed-prototype-shape):
    // `direct` + the `_v` getter live on a shared `ComputedProto` (NOT own
    // per-instance properties), and `_d1`/`_d` are plain DATA fields (NOT
    // `Object.defineProperty` accessor getters, which forced V8 dictionary /
    // slow-properties mode). Bisect-verified: reverting computed.ts to the
    // per-instance-closures + 3×defineProperty shape flips every assertion
    // here (own `_v`/`direct`, accessor `_d1`).
    test('lazy computed: methods on prototype, state as plain data fields', () => {
      const s = signal(2)
      const c = computed(() => s() * 2)
      c() // initialize

      // `_v` + `direct` are inherited from the shared prototype, not own props.
      expect(Object.hasOwn(c, '_v')).toBe(false)
      expect(Object.hasOwn(c, 'direct')).toBe(false)
      // …but still fully functional through the prototype chain.
      expect((c as unknown as { _v: number })._v).toBe(4)
      expect(typeof c.direct).toBe('function')

      // `_d1` is a plain DATA field — no accessor getter (the dictionary-mode
      // trigger we removed). Pre-refactor this was a defineProperty getter.
      const d1Desc = Object.getOwnPropertyDescriptor(c, '_d1')
      expect(d1Desc).toBeDefined()
      expect(d1Desc?.get).toBeUndefined()
      expect(Object.hasOwn(c, '_d1')).toBe(true)
      expect(Object.hasOwn(c, '_d')).toBe(true)

      // setPrototypeOf(_, Function.prototype) contract preserved.
      expect(c instanceof Function).toBe(true)

      // Functional sanity on the new shape: reactivity + direct + dispose.
      let direct = 0
      const stop = c.direct(() => {
        direct++
      })
      s.set(5)
      expect(c()).toBe(10)
      expect(direct).toBe(1)
      stop()
      c.dispose()
    })

    test('equals computed: same prototype shape', () => {
      const s = signal(1)
      const c = computed(() => (s() > 5 ? 'big' : 'small'), { equals: (a, b) => a === b })
      c() // 'small'
      expect(Object.hasOwn(c, '_v')).toBe(false)
      expect(Object.hasOwn(c, 'direct')).toBe(false)
      expect(Object.getOwnPropertyDescriptor(c, '_d1')?.get).toBeUndefined()
      expect(c instanceof Function).toBe(true)
      // equals still suppresses notifications when the dep changes but the
      // derived value doesn't, on the new shape.
      let runs = 0
      c.direct(() => {
        runs++
      })
      s.set(3) // dep changed (1→3) but result 'small' unchanged → suppressed
      expect(runs).toBe(0)
      s.set(9) // result 'small' → 'big' → notifies
      expect(c()).toBe('big')
      expect(runs).toBe(1)
    })
  })
})
