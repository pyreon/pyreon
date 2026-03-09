import { describe, test, expect } from "bun:test"
import {
  h,
  createElement,
  Fragment,
  render,
  Component,
  createContext,
  useContext,
  createRef,
  cloneElement,
  toChildArray,
  isValidElement,
  options,
} from "../index"
import {
  useState,
  useEffect,
  useLayoutEffect,
  useMemo,
  useCallback,
  useRef,
  useReducer,
} from "../hooks"
import {
  signal,
  computed,
  effect,
  batch,
} from "../signals"
import type { VNode } from "@pyreon/core"

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
    const container = document.createElement("div")
    render(h("span", null, "mounted"), container)
    expect(container.innerHTML).toContain("mounted")
  })

  test("isValidElement detects VNodes", () => {
    const vnode = h("div", null)
    expect(isValidElement(vnode)).toBe(true)
    expect(isValidElement(null)).toBe(false)
    expect(isValidElement("string")).toBe(false)
    expect(isValidElement(42)).toBe(false)
    expect(isValidElement({ type: "div", props: {}, children: [] })).toBe(true)
  })

  test("toChildArray flattens children", () => {
    const result = toChildArray(["a", ["b", ["c"]], null, undefined, false, "d"])
    expect(result).toEqual(["a", "b", "c", "d"])
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
    const cloned = cloneElement(original, null, "new")
    expect(cloned.children).toContain("new")
    expect(cloned.children).not.toContain("old")
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

  test("Component class setState updates state", () => {
    class Counter extends Component<{}, { count: number }> {
      constructor(props: {}) {
        super(props)
        this.state = { count: 0 }
      }
      render() { return h("span", null, String(this.state.count)) }
    }
    const c = new Counter({})
    expect(c.state.count).toBe(0)
    c.setState({ count: 5 })
    expect(c.state.count).toBe(5)
    c.setState((prev) => ({ count: prev.count + 1 }))
    expect(c.state.count).toBe(6)
  })

  test("Component class render() returns null by default", () => {
    const c = new Component({})
    expect(c.render()).toBe(null)
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

  test("useRef returns { current }", () => {
    const ref = useRef(42)
    expect(ref.current).toBe(42)
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

  test("useLayoutEffect is same as useEffect", () => {
    expect(useLayoutEffect).toBe(useEffect)
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
