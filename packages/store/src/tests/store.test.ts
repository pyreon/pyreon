import { afterEach, describe, expect, test } from "bun:test"
import { computed, defineStore, resetAllStores, resetStore, signal } from "../index"

afterEach(() => resetAllStores())

describe("defineStore", () => {
  test("returns singleton — setup runs once", () => {
    let runs = 0
    const useStore = defineStore("counter", () => {
      runs++
      const count = signal(0)
      return { count }
    })

    useStore()
    useStore()
    expect(runs).toBe(1)
  })

  test("state is shared across calls", () => {
    const useStore = defineStore("shared", () => {
      const count = signal(0)
      return { count }
    })

    const a = useStore()
    const b = useStore()
    a.count.set(42)
    expect(b.count()).toBe(42)
  })

  test("supports computed values", () => {
    const useStore = defineStore("computed-store", () => {
      const count = signal(3)
      const double = computed(() => count() * 2)
      return { count, double }
    })

    const { count, double } = useStore()
    expect(double()).toBe(6)
    count.set(5)
    expect(double()).toBe(10)
  })

  test("supports actions (plain functions)", () => {
    const useStore = defineStore("actions-store", () => {
      const count = signal(0)
      const increment = () => count.update((n) => n + 1)
      return { count, increment }
    })

    const { count, increment } = useStore()
    increment()
    increment()
    expect(count()).toBe(2)
  })

  test("different ids create independent stores", () => {
    const useA = defineStore("a", () => ({ val: signal(1) }))
    const useB = defineStore("b", () => ({ val: signal(2) }))

    expect(useA().val()).toBe(1)
    expect(useB().val()).toBe(2)
    useA().val.set(99)
    expect(useB().val()).toBe(2)
  })
})

describe("resetStore", () => {
  test("re-runs setup after reset", () => {
    let runs = 0
    const useStore = defineStore("resettable", () => {
      runs++
      return { val: signal(runs) }
    })

    useStore()
    resetStore("resettable")
    useStore()
    expect(runs).toBe(2)
  })

  test("fresh state after reset", () => {
    const useStore = defineStore("fresh", () => ({ count: signal(0) }))

    useStore().count.set(99)
    resetStore("fresh")
    expect(useStore().count()).toBe(0)
  })
})

describe("resetAllStores", () => {
  test("clears all registrations", () => {
    let runsA = 0
    let runsB = 0
    const useA = defineStore("all-a", () => {
      runsA++
      return {}
    })
    const useB = defineStore("all-b", () => {
      runsB++
      return {}
    })

    useA()
    useB()
    resetAllStores()
    useA()
    useB()
    expect(runsA).toBe(2)
    expect(runsB).toBe(2)
  })
})
