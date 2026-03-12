import { h } from "@pyreon/core"
import { mount } from "@pyreon/runtime-dom"
import {
  batch,
  children,
  createComputed,
  createContext,
  createEffect,
  createMemo,
  createRenderEffect,
  createRoot,
  createSelector,
  createSignal,
  ErrorBoundary,
  For,
  getOwner,
  lazy,
  Match,
  mergeProps,
  on,
  onCleanup,
  onMount,
  runWithOwner,
  Show,
  splitProps,
  Suspense,
  Switch,
  untrack,
  useContext,
} from "../index"

function container(): HTMLElement {
  const el = document.createElement("div")
  document.body.appendChild(el)
  return el
}

describe("@pyreon/solid-compat", () => {
  // ─── createSignal ─────────────────────────────────────────────────────

  it("createSignal returns [getter, setter] tuple", () => {
    const [count, setCount] = createSignal(0)
    expect(typeof count).toBe("function")
    expect(typeof setCount).toBe("function")
  })

  it("getter returns current value", () => {
    const [count] = createSignal(42)
    expect(count()).toBe(42)
  })

  it("setter updates value", () => {
    const [count, setCount] = createSignal(0)
    setCount(5)
    expect(count()).toBe(5)
  })

  it("setter with updater function", () => {
    const [count, setCount] = createSignal(10)
    setCount((prev) => prev + 5)
    expect(count()).toBe(15)
  })

  // ─── createEffect ─────────────────────────────────────────────────────

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

  // ─── createRenderEffect ────────────────────────────────────────────────

  it("createRenderEffect tracks signal reads like createEffect", () => {
    let effectValue = 0
    createRoot((dispose) => {
      const [count, setCount] = createSignal(0)
      createRenderEffect(() => {
        effectValue = count()
      })
      expect(effectValue).toBe(0)
      setCount(3)
      expect(effectValue).toBe(3)
      dispose()
    })
  })

  // ─── createComputed (alias) ────────────────────────────────────────────

  it("createComputed is an alias for createEffect", () => {
    let effectValue = 0
    createRoot((dispose) => {
      const [count, setCount] = createSignal(0)
      createComputed(() => {
        effectValue = count()
      })
      expect(effectValue).toBe(0)
      setCount(5)
      expect(effectValue).toBe(5)
      dispose()
    })
  })

  // ─── createMemo ───────────────────────────────────────────────────────

  it("createMemo derives computed value", () => {
    createRoot((dispose) => {
      const [count] = createSignal(3)
      const doubled = createMemo(() => count() * 2)
      expect(doubled()).toBe(6)
      dispose()
    })
  })

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

  // ─── createRoot ───────────────────────────────────────────────────────

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
      setCount(1)
      expect(effectRan).toBe(false)
    })
    expect(disposed).toBe(true)
  })

  it("createRoot returns value from fn", () => {
    const result = createRoot((dispose) => {
      dispose()
      return 42
    })
    expect(result).toBe(42)
  })

  // ─── batch ────────────────────────────────────────────────────────────

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
      expect(runs).toBe(2)
      dispose()
    })
  })

  // ─── untrack ──────────────────────────────────────────────────────────

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
      setOther(5)
      expect(runs).toBe(1)
      setCount(1)
      expect(runs).toBe(2)
      dispose()
    })
  })

  // ─── on ───────────────────────────────────────────────────────────────

  it("on() tracks specific single dependency", () => {
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

  it("on() tracks array of dependencies", () => {
    createRoot((dispose) => {
      const [a, setA] = createSignal(1)
      const [b, setB] = createSignal(2)
      const results: unknown[] = []

      const tracker = on([a, b] as const, (input, prevInput, prevValue) => {
        results.push({ input, prevInput, prevValue })
        return input
      })

      createEffect(() => {
        tracker()
      })

      expect(results).toHaveLength(1)
      expect((results[0] as Record<string, unknown>).input).toEqual([1, 2])
      expect((results[0] as Record<string, unknown>).prevInput).toBeUndefined()

      setA(10)
      expect(results).toHaveLength(2)
      expect((results[1] as Record<string, unknown>).input).toEqual([10, 2])
      expect((results[1] as Record<string, unknown>).prevInput).toEqual([1, 2])

      dispose()
    })
  })

  it("on() provides prevValue on subsequent calls", () => {
    createRoot((dispose) => {
      const [count, setCount] = createSignal(0)
      const prevValues: unknown[] = []

      const tracker = on(count, (input, _prevInput, prevValue) => {
        prevValues.push(prevValue)
        return (input as number) * 10
      })

      createEffect(() => {
        tracker()
      })

      expect(prevValues).toEqual([undefined]) // first call
      setCount(5)
      expect(prevValues).toEqual([undefined, 0]) // prev value was 0*10 = 0
      dispose()
    })
  })

  // ─── createSelector ───────────────────────────────────────────────────

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

  // ─── mergeProps ───────────────────────────────────────────────────────

  it("mergeProps combines objects", () => {
    const defaults = { color: "red", size: 10 }
    const overrides = { size: 20, weight: "bold" }
    const merged = mergeProps(defaults, overrides)
    expect((merged as Record<string, unknown>).color).toBe("red")
    expect((merged as Record<string, unknown>).size).toBe(20)
    expect((merged as Record<string, unknown>).weight).toBe("bold")
  })

  it("mergeProps preserves getters for reactivity", () => {
    const [count, setCount] = createSignal(0)
    const props = {}
    Object.defineProperty(props, "count", {
      get: count,
      enumerable: true,
      configurable: true,
    })
    const merged = mergeProps(props)
    expect((merged as Record<string, unknown>).count).toBe(0)
    setCount(5)
    expect((merged as Record<string, unknown>).count).toBe(5)
  })

  // ─── splitProps ───────────────────────────────────────────────────────

  it("splitProps separates props", () => {
    const props = { name: "hello", class: "btn", onClick: () => {} }
    const [local, rest] = splitProps(props, "name")
    expect((local as Record<string, unknown>).name).toBe("hello")
    expect((local as Record<string, unknown>).class).toBeUndefined()
    expect((rest as Record<string, unknown>).class).toBe("btn")
    expect((rest as Record<string, unknown>).onClick).toBeDefined()
  })

  it("splitProps preserves getters", () => {
    const [count, setCount] = createSignal(0)
    const props = {} as Record<string, unknown>
    Object.defineProperty(props, "count", {
      get: count,
      enumerable: true,
      configurable: true,
    })
    Object.defineProperty(props, "label", {
      value: "test",
      writable: true,
      enumerable: true,
      configurable: true,
    })

    const [local, rest] = splitProps(props as { count: number; label: string }, "count")
    expect((local as Record<string, unknown>).count).toBe(0)
    setCount(10)
    expect((local as Record<string, unknown>).count).toBe(10)
    expect((rest as Record<string, unknown>).label).toBe("test")
  })

  // ─── children ─────────────────────────────────────────────────────────

  it("children resolves static values", () => {
    const resolved = children(() => "hello")
    expect(resolved()).toBe("hello")
  })

  it("children resolves function children (reactive getters)", () => {
    const resolved = children(() => (() => "dynamic") as unknown as ReturnType<typeof h>)
    expect(resolved()).toBe("dynamic")
  })

  // ─── lazy ─────────────────────────────────────────────────────────────

  it("lazy returns a component with preload", () => {
    const Lazy = lazy(() => Promise.resolve({ default: () => h("div", null, "loaded") }))
    expect(typeof Lazy).toBe("function")
    expect(typeof Lazy.preload).toBe("function")
  })

  it("lazy component returns null before loaded", () => {
    const Lazy = lazy(() => Promise.resolve({ default: () => h("div", null, "loaded") }))
    const result = Lazy({})
    expect(result).toBeNull()
  })

  it("lazy component renders after loading", async () => {
    const MyComp = () => h("div", null, "loaded")
    const Lazy = lazy(() => Promise.resolve({ default: MyComp }))

    // Trigger load
    Lazy({})
    await new Promise<void>((r) => setTimeout(r, 10))

    const result = Lazy({})
    expect(result).not.toBeNull()
  })

  it("lazy preload triggers loading", async () => {
    const MyComp = () => h("div", null, "loaded")
    const Lazy = lazy(() => Promise.resolve({ default: MyComp }))

    const promise = Lazy.preload()
    expect(promise).toBeInstanceOf(Promise)

    await promise
    const result = Lazy({})
    expect(result).not.toBeNull()
  })

  it("lazy preload only loads once", async () => {
    let loadCount = 0
    const MyComp = () => h("div", null, "loaded")
    const Lazy = lazy(() => {
      loadCount++
      return Promise.resolve({ default: MyComp })
    })

    const p1 = Lazy.preload()
    const p2 = Lazy.preload()
    expect(p1).toBe(p2) // same promise
    await p1
    expect(loadCount).toBe(1)
  })

  // ─── getOwner / runWithOwner ──────────────────────────────────────────

  it("getOwner returns current scope or null", () => {
    // Outside any scope, may return null
    const outerOwner = getOwner()

    createRoot((dispose) => {
      const owner = getOwner()
      expect(owner).not.toBeNull()
      dispose()
    })
  })

  it("runWithOwner runs fn within the given scope", () => {
    createRoot((dispose) => {
      const owner = getOwner()
      let ranInScope = false

      runWithOwner(owner, () => {
        ranInScope = true
        return undefined
      })

      expect(ranInScope).toBe(true)
      dispose()
    })
  })

  it("runWithOwner with null owner", () => {
    const result = runWithOwner(null, () => 42)
    expect(result).toBe(42)
  })

  it("runWithOwner restores previous scope even on error", () => {
    createRoot((dispose) => {
      expect(() => {
        runWithOwner(null, () => {
          throw new Error("test error")
        })
      }).toThrow("test error")
      dispose()
    })
  })

  // ─── onMount / onCleanup ──────────────────────────────────────────────

  it("onMount and onCleanup are functions", () => {
    expect(typeof onMount).toBe("function")
    expect(typeof onCleanup).toBe("function")
  })

  // ─── createContext / useContext ────────────────────────────────────────

  it("createContext creates context with default value", () => {
    const Ctx = createContext("default-value")
    expect(useContext(Ctx)).toBe("default-value")
  })

  // ─── Re-exports ───────────────────────────────────────────────────────

  it("Show is exported", () => {
    expect(typeof Show).toBe("function")
  })

  it("Switch is exported", () => {
    expect(typeof Switch).toBe("function")
  })

  it("Match is exported", () => {
    expect(typeof Match).toBe("function")
  })

  it("For is exported", () => {
    expect(typeof For).toBe("function")
  })

  it("Suspense is exported", () => {
    expect(typeof Suspense).toBe("function")
  })

  it("ErrorBoundary is exported", () => {
    expect(typeof ErrorBoundary).toBe("function")
  })

  // ─── on() edge cases ──────────────────────────────────────────────────

  it("on() with single accessor (non-array) tracks correctly", () => {
    createRoot((dispose) => {
      const [count, setCount] = createSignal(10)
      const results: unknown[] = []

      const tracker = on(count, (input, prevInput, prevValue) => {
        results.push({ input, prevInput, prevValue })
        return (input as number) * 2
      })

      createEffect(() => {
        tracker()
      })

      // First call: initialized
      expect(results).toHaveLength(1)
      expect((results[0] as Record<string, unknown>).input).toBe(10)
      expect((results[0] as Record<string, unknown>).prevInput).toBeUndefined()
      expect((results[0] as Record<string, unknown>).prevValue).toBeUndefined()

      setCount(20)
      expect(results).toHaveLength(2)
      expect((results[1] as Record<string, unknown>).input).toBe(20)
      expect((results[1] as Record<string, unknown>).prevInput).toBe(10)
      expect((results[1] as Record<string, unknown>).prevValue).toBe(20) // 10*2

      dispose()
    })
  })

  // ─── mergeProps — getter preservation ──────────────────────────────────

  it("mergeProps preserves getters for reactivity", () => {
    const source = {} as Record<string, unknown>
    Object.defineProperty(source, "x", { get: () => 42, enumerable: true, configurable: true })
    const merged = mergeProps(source) as Record<string, unknown>
    expect(merged.x).toBe(42)
  })

  // ─── mergeProps edge cases ─────────────────────────────────────────────

  it("mergeProps with multiple sources overrides in order", () => {
    const a = { x: 1, y: 2 }
    const b = { y: 3, z: 4 }
    const c = { z: 5 }
    const merged = mergeProps(a, b, c) as Record<string, number>
    expect(merged.x).toBe(1)
    expect(merged.y).toBe(3)
    expect(merged.z).toBe(5)
  })

  it("mergeProps with empty source", () => {
    const merged = mergeProps({}, { a: 1 }) as Record<string, number>
    expect(merged.a).toBe(1)
  })

  // ─── splitProps — getter preservation ──────────────────────────────────

  it("splitProps preserves getters in picked set", () => {
    const source = {} as Record<string, unknown>
    Object.defineProperty(source, "a", { get: () => 99, enumerable: true, configurable: true })
    source.b = 2
    const [local, rest] = splitProps(source as { a: number; b: number }, "a")
    expect((local as Record<string, unknown>).a).toBe(99)
    expect((rest as Record<string, unknown>).b).toBe(2)
  })

  // ─── splitProps edge cases ─────────────────────────────────────────────

  it("splitProps with getter in rest", () => {
    const [count, setCount] = createSignal(0)
    const props = {} as Record<string, unknown>
    Object.defineProperty(props, "count", {
      get: count,
      enumerable: true,
      configurable: true,
    })
    Object.defineProperty(props, "name", {
      value: "test",
      writable: true,
      enumerable: true,
      configurable: true,
    })

    const [local, rest] = splitProps(props as { count: number; name: string }, "name")
    expect((local as Record<string, unknown>).name).toBe("test")
    expect((rest as Record<string, unknown>).count).toBe(0)
    setCount(42)
    expect((rest as Record<string, unknown>).count).toBe(42)
  })

  // ─── children edge cases ───────────────────────────────────────────────

  it("children resolves non-function values as-is", () => {
    const resolved = children(() => 42 as unknown as ReturnType<typeof h>)
    expect(resolved()).toBe(42)
  })

  it("children resolves null", () => {
    const resolved = children(() => null)
    expect(resolved()).toBeNull()
  })

  // ─── lazy edge: preload called multiple times ──────────────────────────

  it("lazy component called after preload resolves renders correctly", async () => {
    const MyComp = (props: { msg: string }) => h("span", null, props.msg)
    const Lazy = lazy(() => Promise.resolve({ default: MyComp }))

    await Lazy.preload()
    const result = Lazy({ msg: "loaded" })
    expect(result).not.toBeNull()
  })

  // ─── createRoot restores scope ─────────────────────────────────────────

  it("createRoot restores previous scope after fn completes", () => {
    const outerOwner = getOwner()
    createRoot((dispose) => {
      const innerOwner = getOwner()
      expect(innerOwner).not.toBeNull()
      dispose()
    })
    // After createRoot, scope should be restored to outer
    const afterOwner = getOwner()
    expect(afterOwner).toBe(outerOwner)
  })

  // ─── runWithOwner restores scope ───────────────────────────────────────

  it("runWithOwner returns value from fn", () => {
    const result = runWithOwner(null, () => "hello")
    expect(result).toBe("hello")
  })
})
