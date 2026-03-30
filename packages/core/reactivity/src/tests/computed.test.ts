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
})
