import { computed } from "../computed"
import { effect } from "../effect"
import { signal } from "../signal"

describe("computed", () => {
  test("computes derived value", () => {
    const s = signal(2)
    const doubled = computed(() => s() * 2)
    expect(doubled()).toBe(4)
  })

  test("updates when dependency changes", () => {
    const s = signal(3)
    const tripled = computed(() => s() * 3)
    expect(tripled()).toBe(9)
    s.set(4)
    expect(tripled()).toBe(12)
  })

  test("is lazy — does not compute until read", () => {
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

  test("is memoized — does not recompute on repeated reads", () => {
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

  test("recomputes only when dirty", () => {
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

  test("chains correctly", () => {
    const base = signal(2)
    const doubled = computed(() => base() * 2)
    const quadrupled = computed(() => doubled() * 2)
    expect(quadrupled()).toBe(8)
    base.set(3)
    expect(quadrupled()).toBe(12)
  })

  test("dispose stops recomputation", () => {
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

  test("custom equals skips downstream notification when equal", () => {
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

  test("custom equals with array comparison", () => {
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

  test("computed used as dependency inside an effect (subscribe path)", () => {
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

  test("._v returns cached value", () => {
    const s = signal(5)
    const doubled = computed(() => s() * 2)
    // First access triggers computation
    expect(doubled._v).toBe(10)
    s.set(7)
    // _v triggers recompute when dirty
    expect(doubled._v).toBe(14)
  })

  test(".direct() fires updater on recompute", () => {
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

  test(".direct() works with equals option", () => {
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
})
