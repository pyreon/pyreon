import {
  batch,
  createEffect,
  createMemo,
  createRoot,
  createSelector,
  createSignal,
  mergeProps,
  on,
  onCleanup,
  onMount,
  splitProps,
  untrack,
} from "../index"

describe("@pyreon/solid-compat", () => {
  // 1. createSignal returns [getter, setter] tuple
  it("createSignal returns [getter, setter] tuple", () => {
    const [count, setCount] = createSignal(0)
    expect(typeof count).toBe("function")
    expect(typeof setCount).toBe("function")
  })

  // 2. getter returns current value
  it("getter returns current value", () => {
    const [count] = createSignal(42)
    expect(count()).toBe(42)
  })

  // 3. setter updates value
  it("setter updates value", () => {
    const [count, setCount] = createSignal(0)
    setCount(5)
    expect(count()).toBe(5)
  })

  // 4. setter with updater function
  it("setter with updater function", () => {
    const [count, setCount] = createSignal(10)
    setCount((prev) => prev + 5)
    expect(count()).toBe(15)
  })

  // 5. createEffect tracks signal reads
  it("createEffect tracks signal reads", () => {
    let effectValue = 0
    createRoot((dispose) => {
      const [count, setCount] = createSignal(0)
      createEffect(() => {
        effectValue = count()
      })
      expect(effectValue).toBe(0)
      setCount(7)
      expect(effectValue).toBe(7)
      dispose()
    })
  })

  // 6. createMemo derives computed value
  it("createMemo derives computed value", () => {
    createRoot((dispose) => {
      const [count] = createSignal(3)
      const doubled = createMemo(() => count() * 2)
      expect(doubled()).toBe(6)
      dispose()
    })
  })

  // 7. createMemo updates when dependency changes
  it("createMemo updates when dependency changes", () => {
    createRoot((dispose) => {
      const [count, setCount] = createSignal(3)
      const doubled = createMemo(() => count() * 2)
      expect(doubled()).toBe(6)
      setCount(10)
      expect(doubled()).toBe(20)
      dispose()
    })
  })

  // 8. batch coalesces updates
  it("batch coalesces updates", () => {
    let runs = 0
    createRoot((dispose) => {
      const [a, setA] = createSignal(1)
      const [b, setB] = createSignal(2)
      createEffect(() => {
        a()
        b()
        runs++
      })
      expect(runs).toBe(1)
      batch(() => {
        setA(10)
        setB(20)
      })
      // Should have only run once more (not twice)
      expect(runs).toBe(2)
      dispose()
    })
  })

  // 9. untrack prevents tracking
  it("untrack prevents tracking", () => {
    let runs = 0
    createRoot((dispose) => {
      const [count, setCount] = createSignal(0)
      const [other, setOther] = createSignal(0)
      createEffect(() => {
        count()
        untrack(() => other())
        runs++
      })
      expect(runs).toBe(1)
      // Updating untracked signal should not re-run effect
      setOther(5)
      expect(runs).toBe(1)
      // Updating tracked signal should re-run
      setCount(1)
      expect(runs).toBe(2)
      dispose()
    })
  })

  // 10. on() tracks specific dependencies
  it("on() tracks specific dependencies", () => {
    createRoot((dispose) => {
      const [count, setCount] = createSignal(0)
      const values: number[] = []

      const tracker = on(count, (input) => {
        values.push(input as number)
        return input
      })

      createEffect(() => {
        tracker()
      })

      expect(values).toEqual([0])
      setCount(5)
      expect(values).toEqual([0, 5])
      dispose()
    })
  })

  // 11. createSelector returns equality checker
  it("createSelector returns equality checker", () => {
    createRoot((dispose) => {
      const [selected, setSelected] = createSignal(1)
      const isSelected = createSelector(selected)

      expect(isSelected(1)).toBe(true)
      expect(isSelected(2)).toBe(false)

      setSelected(2)
      expect(isSelected(1)).toBe(false)
      expect(isSelected(2)).toBe(true)
      dispose()
    })
  })

  // 12. mergeProps combines objects
  it("mergeProps combines objects", () => {
    const defaults = { color: "red", size: 10 }
    const overrides = { size: 20, weight: "bold" }
    const merged = mergeProps(defaults, overrides)
    expect((merged as Record<string, unknown>).color).toBe("red")
    expect((merged as Record<string, unknown>).size).toBe(20)
    expect((merged as Record<string, unknown>).weight).toBe("bold")
  })

  // 13. splitProps separates props
  it("splitProps separates props", () => {
    const props = { name: "hello", class: "btn", onClick: () => {} }
    const [local, rest] = splitProps(props, "name")
    expect((local as Record<string, unknown>).name).toBe("hello")
    expect((local as Record<string, unknown>).class).toBeUndefined()
    expect((rest as Record<string, unknown>).class).toBe("btn")
    expect((rest as Record<string, unknown>).onClick).toBeDefined()
  })

  // 14. createRoot provides cleanup
  it("createRoot provides cleanup", () => {
    let effectRan = false
    let disposed = false
    createRoot((dispose) => {
      const [count, setCount] = createSignal(0)
      createEffect(() => {
        count()
        effectRan = true
      })
      expect(effectRan).toBe(true)
      effectRan = false
      dispose()
      disposed = true
      // After dispose, updating signal should not re-trigger effect
      setCount(1)
      expect(effectRan).toBe(false)
    })
    expect(disposed).toBe(true)
  })

  // 15. onMount/onCleanup lifecycle hooks exist
  it("onMount and onCleanup are functions", () => {
    expect(typeof onMount).toBe("function")
    expect(typeof onCleanup).toBe("function")
  })
})
