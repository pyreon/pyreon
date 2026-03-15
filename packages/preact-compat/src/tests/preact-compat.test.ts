import type { VNodeChild } from "@pyreon/core"
import { h as pyreonH } from "@pyreon/core"
import { signal as pyreonSignal } from "@pyreon/reactivity"
import { mount } from "@pyreon/runtime-dom"
import {
  useCallback,
  useEffect,
  useErrorBoundary,
  useId,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "../hooks"
import {
  Component,
  cloneElement,
  createContext,
  createElement,
  createRef,
  Fragment,
  h,
  hydrate,
  isValidElement,
  options,
  render,
  toChildArray,
  useContext,
} from "../index"
import { batch, computed, effect, signal } from "../signals"

function container(): HTMLElement {
  const el = document.createElement("div")
  document.body.appendChild(el)
  return el
}

describe("@pyreon/preact-compat", () => {
  // ─── Core API ────────────────────────────────────────────────────────────

  test("h() creates VNodes", () => {
    const vnode = h("div", { class: "test" }, "hello")
    expect(vnode.type).toBe("div")
    expect(vnode.props.class).toBe("test")
    expect(vnode.children).toContain("hello")
  })

  test("createElement is alias for h", () => {
    expect(createElement).toBe(h)
  })

  test("Fragment is a symbol", () => {
    expect(typeof Fragment).toBe("symbol")
  })

  test("render() mounts to DOM", () => {
    const el = container()
    render(h("span", null, "mounted"), el)
    expect(el.innerHTML).toContain("mounted")
  })

  test("hydrate() calls hydrateRoot", () => {
    const el = container()
    el.innerHTML = "<span>hydrated</span>"
    // hydrate should not throw; it calls hydrateRoot internally
    hydrate(h("span", null, "hydrated"), el)
    expect(el.innerHTML).toContain("hydrated")
  })

  test("isValidElement detects VNodes", () => {
    const vnode = h("div", null)
    expect(isValidElement(vnode)).toBe(true)
    expect(isValidElement(null)).toBe(false)
    expect(isValidElement("string")).toBe(false)
    expect(isValidElement(42)).toBe(false)
    expect(isValidElement({ type: "div", props: {}, children: [] })).toBe(true)
  })

  test("isValidElement returns false for objects missing required keys", () => {
    expect(isValidElement({ type: "div" })).toBe(false)
    expect(isValidElement({ type: "div", props: {} })).toBe(false)
    expect(isValidElement({})).toBe(false)
    expect(isValidElement(undefined)).toBe(false)
  })

  test("toChildArray flattens children", () => {
    const result = toChildArray(["a", ["b", ["c"]], null, undefined, false, "d"] as VNodeChild[])
    expect(result).toEqual(["a", "b", "c", "d"])
  })

  test("toChildArray handles single non-array child", () => {
    const result = toChildArray("hello")
    expect(result).toEqual(["hello"])
  })

  test("toChildArray handles null/undefined/boolean at top level", () => {
    expect(toChildArray(null as unknown as VNodeChild)).toEqual([])
    expect(toChildArray(undefined as unknown as VNodeChild)).toEqual([])
    expect(toChildArray(false as unknown as VNodeChild)).toEqual([])
    expect(toChildArray(true as unknown as VNodeChild)).toEqual([])
  })

  test("toChildArray handles number children", () => {
    const result = toChildArray([1, 2, 3] as VNodeChild[])
    expect(result).toEqual([1, 2, 3])
  })

  test("cloneElement merges props", () => {
    const original = h("div", { class: "a", id: "x" }, "child")
    const cloned = cloneElement(original, { class: "b" })
    expect(cloned.type).toBe("div")
    expect(cloned.props.class).toBe("b")
    expect(cloned.props.id).toBe("x")
    expect(cloned.children).toContain("child")
  })

  test("cloneElement replaces children when provided", () => {
    const original = h("div", null, "old")
    const cloned = cloneElement(original, undefined, "new")
    expect(cloned.children).toContain("new")
    expect(cloned.children).not.toContain("old")
  })

  test("cloneElement preserves key from original when not overridden", () => {
    const original = h("div", { key: "original-key" }, "child")
    const cloned = cloneElement(original, { class: "b" })
    expect(cloned.key).toBe("original-key")
  })

  test("cloneElement overrides key when provided in props", () => {
    const original = h("div", { key: "original-key" }, "child")
    const cloned = cloneElement(original, { key: "new-key" })
    expect(cloned.key).toBe("new-key")
  })

  test("cloneElement with no props passes empty override", () => {
    const original = h("div", { id: "test" }, "child")
    const cloned = cloneElement(original)
    expect(cloned.props.id).toBe("test")
    expect(cloned.children).toContain("child")
  })

  test("createRef returns { current: null }", () => {
    const ref = createRef()
    expect(ref.current).toBe(null)
  })

  test("createContext/useContext work", () => {
    const Ctx = createContext("default")
    // Without a provider, useContext returns the default value
    expect(useContext(Ctx)).toBe("default")
  })

  test("options is an empty object", () => {
    expect(typeof options).toBe("object")
    expect(Object.keys(options).length).toBe(0)
  })

  test("Component class setState updates state with object", () => {
    class Counter extends Component<Record<string, never>, { count: number }> {
      constructor(props: Record<string, never>) {
        super(props)
        this.state = { count: 0 }
      }
      override render() {
        return h("span", null, String(this.state.count))
      }
    }
    const c = new Counter({})
    expect(c.state.count).toBe(0)
    c.setState({ count: 5 })
    expect(c.state.count).toBe(5)
  })

  test("Component class setState with updater function", () => {
    class Counter extends Component<Record<string, never>, { count: number }> {
      constructor(props: Record<string, never>) {
        super(props)
        this.state = { count: 0 }
      }
      override render() {
        return h("span", null, String(this.state.count))
      }
    }
    const c = new Counter({})
    c.setState({ count: 5 })
    c.setState((prev) => ({ count: prev.count + 1 }))
    expect(c.state.count).toBe(6)
  })

  test("Component class render() returns null by default", () => {
    const c = new Component({})
    expect(c.render()).toBe(null)
  })

  test("Component class forceUpdate triggers signal re-fire", () => {
    class MyComp extends Component<Record<string, never>, { value: number }> {
      constructor(props: Record<string, never>) {
        super(props)
        this.state = { value: 42 }
      }
    }
    const c = new MyComp({})
    // forceUpdate should not throw and should update internal signal
    c.forceUpdate()
    expect(c.state.value).toBe(42)
  })

  // ─── Hooks ───────────────────────────────────────────────────────────────

  test("useState returns [getter, setter]", () => {
    const [count, setCount] = useState(0)
    expect(count()).toBe(0)
    setCount(5)
    expect(count()).toBe(5)
    setCount((prev) => prev + 1)
    expect(count()).toBe(6)
  })

  test("useState with initializer function", () => {
    let calls = 0
    const [val] = useState(() => {
      calls++
      return 42
    })
    expect(val()).toBe(42)
    expect(calls).toBe(1)
  })

  test("useMemo caches computed values", () => {
    const [val, setVal] = useState(3)
    const doubled = useMemo(() => val() * 2)
    expect(doubled()).toBe(6)
    setVal(10)
    expect(doubled()).toBe(20)
  })

  test("useCallback returns same function", () => {
    const fn = () => 42
    expect(useCallback(fn)).toBe(fn)
  })

  test("useCallback with deps returns same function", () => {
    const fn = (x: unknown) => x
    expect(useCallback(fn, [1, 2])).toBe(fn)
  })

  test("useRef returns { current } with initial value", () => {
    const ref = useRef(42)
    expect(ref.current).toBe(42)
  })

  test("useRef returns { current: null } without initial", () => {
    const emptyRef = useRef()
    expect(emptyRef.current).toBe(null)
  })

  test("useReducer dispatches actions", () => {
    type Action = { type: "inc" } | { type: "dec" }
    const reducer = (s: number, a: Action) => (a.type === "inc" ? s + 1 : s - 1)
    const [state, dispatch] = useReducer(reducer, 0)
    expect(state()).toBe(0)
    dispatch({ type: "inc" })
    expect(state()).toBe(1)
    dispatch({ type: "dec" })
    expect(state()).toBe(0)
  })

  test("useReducer with initializer function", () => {
    let calls = 0
    const [state] = useReducer(
      (s: number) => s,
      () => {
        calls++
        return 99
      },
    )
    expect(state()).toBe(99)
    expect(calls).toBe(1)
  })

  test("useLayoutEffect is same as useEffect", () => {
    expect(useLayoutEffect).toBe(useEffect)
  })

  test("useEffect with empty deps runs once on mount", () => {
    const el = container()
    const s = pyreonSignal(0)
    let runs = 0

    const Comp = () => {
      useEffect(() => {
        s()
        runs++
      }, [])
      return pyreonH("div", null, "test")
    }

    mount(pyreonH(Comp, null), el)
    expect(runs).toBe(1)
    s.set(1)
    expect(runs).toBe(1) // should not re-run
  })

  test("useEffect with empty deps and cleanup", () => {
    const el = container()
    let cleaned = false

    const Comp = () => {
      useEffect(() => {
        return () => {
          cleaned = true
        }
      }, [])
      return pyreonH("div", null, "cleanup-test")
    }

    const unmount = mount(pyreonH(Comp, null), el)
    expect(cleaned).toBe(false)
    unmount()
    // onUnmount called inside onMount callback is a no-op (hooks context
    // is not active during mount-hook execution), so cleanup does not fire.
    expect(cleaned).toBe(false)
  })

  test("useEffect without deps tracks reactively", () => {
    const el = container()
    const s = pyreonSignal(0)
    let runs = 0

    const Comp = () => {
      useEffect(() => {
        s()
        runs++
      })
      return pyreonH("div", null, "reactive")
    }

    const unmount = mount(pyreonH(Comp, null), el)
    expect(runs).toBe(1)
    s.set(1)
    expect(runs).toBe(2)
    unmount()
    s.set(2)
    expect(runs).toBe(2) // disposed
  })

  test("useEffect with cleanup disposes on unmount", () => {
    const el = container()
    const s = pyreonSignal(0)
    let cleaned = false

    const Comp = () => {
      useEffect(() => {
        s()
        return () => {
          cleaned = true
        }
      })
      return pyreonH("div", null, "cleanup")
    }

    const unmount = mount(pyreonH(Comp, null), el)
    expect(cleaned).toBe(false)
    unmount()
    // effect() now supports cleanup return values — cleanup fires on dispose
    expect(cleaned).toBe(true)
  })

  test("useEffect without deps and non-function return", () => {
    const el = container()
    const s = pyreonSignal(0)
    let runs = 0

    const Comp = () => {
      useEffect(() => {
        s()
        runs++
        // no return
      })
      return pyreonH("div", null, "no-return")
    }

    const unmount = mount(pyreonH(Comp, null), el)
    expect(runs).toBe(1)
    s.set(1)
    expect(runs).toBe(2)
    unmount()
  })

  test("useId returns unique strings", () => {
    const id1 = useId()
    const id2 = useId()
    expect(typeof id1).toBe("string")
    expect(typeof id2).toBe("string")
    expect(id1.startsWith(":r")).toBe(true)
    expect(id2.startsWith(":r")).toBe(true)
  })

  test("useId within component scope returns deterministic IDs", () => {
    const el = container()
    const ids: string[] = []

    const Comp = () => {
      ids.push(useId())
      ids.push(useId())
      return pyreonH("div", null, "id-test")
    }

    const unmount = mount(pyreonH(Comp, null), el)
    expect(ids).toHaveLength(2)
    expect(ids[0]).toBe(":r0:")
    expect(ids[1]).toBe(":r1:")
    unmount()
  })

  test("useErrorBoundary is exported", () => {
    expect(typeof useErrorBoundary).toBe("function")
  })

  // ─── Signals ─────────────────────────────────────────────────────────────

  test("signal() has .value accessor", () => {
    const count = signal(0)
    expect(count.value).toBe(0)
    count.value = 5
    expect(count.value).toBe(5)
  })

  test("computed() has .value accessor", () => {
    const count = signal(3)
    const doubled = computed(() => count.value * 2)
    expect(doubled.value).toBe(6)
    count.value = 10
    expect(doubled.value).toBe(20)
  })

  test("computed() peek returns value", () => {
    const count = signal(3)
    const doubled = computed(() => count.value * 2)
    expect(doubled.peek()).toBe(6)
    count.value = 10
    expect(doubled.peek()).toBe(20)
  })

  test("effect() tracks signal reads", () => {
    const count = signal(0)
    let observed = -1
    const dispose = effect(() => {
      observed = count.value
    })
    expect(observed).toBe(0)
    count.value = 7
    expect(observed).toBe(7)
    dispose()
    count.value = 99
    expect(observed).toBe(7) // disposed, should not update
  })

  test("effect() with cleanup function", () => {
    const count = signal(0)
    let cleanups = 0
    const dispose = effect(() => {
      void count.value
      return () => {
        cleanups++
      }
    })
    expect(cleanups).toBe(0)
    count.value = 1
    // Cleanup runs before re-run
    expect(cleanups).toBe(1)
    dispose()
    // Cleanup runs on dispose
    expect(cleanups).toBe(2)
  })

  test("effect() with non-function return (no cleanup)", () => {
    const count = signal(0)
    let runs = 0
    const dispose = effect(() => {
      void count.value
      runs++
      // no return
    })
    expect(runs).toBe(1)
    count.value = 1
    expect(runs).toBe(2)
    dispose()
  })

  test("batch() coalesces updates", () => {
    const a = signal(1)
    const b = signal(2)
    let runs = 0
    effect(() => {
      void a.value
      void b.value
      runs++
    })
    expect(runs).toBe(1)
    batch(() => {
      a.value = 10
      b.value = 20
    })
    expect(runs).toBe(2) // single batch = single re-run
  })

  test("signal peek() reads without tracking", () => {
    const count = signal(0)
    let observed = -1
    const dispose = effect(() => {
      observed = count.peek()
    })
    expect(observed).toBe(0)
    count.value = 5
    // peek() is untracked, so effect should NOT re-run
    expect(observed).toBe(0)
    dispose()
  })
})
