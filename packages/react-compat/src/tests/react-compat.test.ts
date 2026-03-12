import { h } from "@pyreon/core"
import { effect, signal } from "@pyreon/reactivity"
import { mount } from "@pyreon/runtime-dom"
import { createRoot, render } from "../dom"
import {
  batch,
  createContext,
  createElement,
  createPortal,
  createSelector,
  ErrorBoundary,
  Fragment,
  lazy,
  memo,
  onMount,
  onUnmount,
  onUpdate,
  Suspense,
  useCallback,
  useContext,
  useDeferredValue,
  useEffect,
  useErrorBoundary,
  useId,
  useImperativeHandle,
  useLayoutEffect,
  useLayoutEffect_,
  useMemo,
  useReducer,
  useRef,
  useState,
  useTransition,
} from "../index"

function container(): HTMLElement {
  const el = document.createElement("div")
  document.body.appendChild(el)
  return el
}

// ─── useState ─────────────────────────────────────────────────────────────────

describe("useState", () => {
  test("returns [getter, setter] — getter reads initial value", () => {
    const [count] = useState(0)
    expect(count()).toBe(0)
  })

  test("setter updates value", () => {
    const [count, setCount] = useState(0)
    setCount(5)
    expect(count()).toBe(5)
  })

  test("setter with function updater", () => {
    const [count, setCount] = useState(10)
    setCount((prev) => prev + 1)
    expect(count()).toBe(11)
    setCount((prev) => prev * 2)
    expect(count()).toBe(22)
  })

  test("initializer function is called once", () => {
    let calls = 0
    const [val] = useState(() => {
      calls++
      return 42
    })
    expect(val()).toBe(42)
    expect(calls).toBe(1)
  })

  test("getter is reactive — effect tracks it", () => {
    const [count, setCount] = useState(0)
    let observed = -1
    effect(() => {
      observed = count()
    })
    expect(observed).toBe(0)
    setCount(7)
    expect(observed).toBe(7)
  })
})

// ─── useReducer ───────────────────────────────────────────────────────────────

describe("useReducer", () => {
  test("dispatch applies reducer", () => {
    type Action = { type: "inc" } | { type: "dec" }
    const reducer = (state: number, action: Action) =>
      action.type === "inc" ? state + 1 : state - 1
    const [state, dispatch] = useReducer(reducer, 0)
    expect(state()).toBe(0)
    dispatch({ type: "inc" })
    expect(state()).toBe(1)
    dispatch({ type: "inc" })
    expect(state()).toBe(2)
    dispatch({ type: "dec" })
    expect(state()).toBe(1)
  })

  test("initializer function is called once", () => {
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
})

// ─── useEffect ────────────────────────────────────────────────────────────────

describe("useEffect", () => {
  test("runs reactively when signals change", () => {
    const el = container()
    const s = signal(0)
    let runs = 0

    const Comp = () => {
      useEffect(() => {
        s() // read signal to track
        runs++
      })
      return h("div", null, "test")
    }

    mount(h(Comp, null), el)
    expect(runs).toBe(1)
    s.set(1)
    expect(runs).toBe(2)
    s.set(2)
    expect(runs).toBe(3)
  })

  test("with empty deps [] — runs once on mount only", () => {
    const el = container()
    const s = signal(0)
    let runs = 0

    const Comp = () => {
      useEffect(() => {
        s()
        runs++
      }, [])
      return h("div", null, "test")
    }

    mount(h(Comp, null), el)
    expect(runs).toBe(1)
    s.set(1)
    expect(runs).toBe(1)
  })

  test("with empty deps [] and cleanup on unmount", () => {
    const el = container()
    let cleaned = false

    const Comp = () => {
      useEffect(() => {
        return () => {
          cleaned = true
        }
      }, [])
      return h("div", null, "test")
    }

    const unmount = mount(h(Comp, null), el)
    expect(cleaned).toBe(false)
    unmount()
    // onUnmount called inside onMount callback is a no-op (hooks context
    // is not active during mount-hook execution), so cleanup does not fire.
    expect(cleaned).toBe(false)
  })

  test("with empty deps [] and no cleanup return", () => {
    const el = container()
    let runs = 0

    const Comp = () => {
      useEffect(() => {
        runs++
        // no return
      }, [])
      return h("div", null, "test")
    }

    const unmount = mount(h(Comp, null), el)
    expect(runs).toBe(1)
    unmount()
  })

  test("effect without deps re-runs and disposes on unmount", () => {
    const el = container()
    const s = signal(0)
    let runs = 0

    const Comp = () => {
      useEffect(() => {
        s()
        runs++
      })
      return h("div", null, "test")
    }

    const unmount = mount(h(Comp, null), el)
    expect(runs).toBe(1)
    s.set(10)
    expect(runs).toBe(2)
    unmount()
    s.set(20)
    expect(runs).toBe(2)
  })

  test("effect with cleanup function disposes on unmount", () => {
    const el = container()
    const s = signal(0)
    let effectRuns = 0

    const Comp = () => {
      useEffect(() => {
        s()
        effectRuns++
        return () => {
          /* cleanup */
        }
      })
      return h("div", null, "cleanup")
    }

    const unmount = mount(h(Comp, null), el)
    expect(effectRuns).toBe(1)
    s.set(1)
    expect(effectRuns).toBe(2)
    unmount()
    s.set(2)
    expect(effectRuns).toBe(2)
  })

  test("non-function return from effect is handled", () => {
    const el = container()
    const s = signal(0)
    let runs = 0

    const Comp = () => {
      useEffect(() => {
        s()
        runs++
      })
      return h("div", null, "no-cleanup")
    }

    const unmount = mount(h(Comp, null), el)
    expect(runs).toBe(1)
    s.set(1)
    expect(runs).toBe(2)
    unmount()
  })
})

// ─── useMemo ──────────────────────────────────────────────────────────────────

describe("useMemo", () => {
  test("returns computed getter", () => {
    const s = signal(3)
    const doubled = useMemo(() => s() * 2)
    expect(doubled()).toBe(6)
    s.set(5)
    expect(doubled()).toBe(10)
  })

  test("deps array is ignored — still auto-tracks", () => {
    const s = signal(1)
    const memo = useMemo(() => s() + 100, [])
    expect(memo()).toBe(101)
    s.set(2)
    expect(memo()).toBe(102)
  })
})

// ─── useCallback ──────────────────────────────────────────────────────────────

describe("useCallback", () => {
  test("returns the same function", () => {
    const fn = () => 42
    const result = useCallback(fn)
    expect(result).toBe(fn)
    expect(result()).toBe(42)
  })

  test("with deps array — still returns same function", () => {
    const fn = (x: unknown) => x
    const result = useCallback(fn, [1, 2, 3])
    expect(result).toBe(fn)
  })
})

// ─── useRef ───────────────────────────────────────────────────────────────────

describe("useRef", () => {
  test("returns { current } with null default", () => {
    const ref = useRef<HTMLDivElement>()
    expect(ref.current).toBeNull()
  })

  test("returns { current } with initial value", () => {
    const ref = useRef(42)
    expect(ref.current).toBe(42)
  })

  test("current is mutable", () => {
    const ref = useRef(0)
    ref.current = 10
    expect(ref.current).toBe(10)
  })
})

// ─── memo ─────────────────────────────────────────────────────────────────────

describe("memo", () => {
  test("returns component as-is (no-op)", () => {
    const MyComp = (props: { name: string }) => h("span", null, props.name)
    const Memoized = memo(MyComp)
    expect(Memoized).toBe(MyComp)
  })
})

// ─── useTransition ────────────────────────────────────────────────────────────

describe("useTransition", () => {
  test("returns [false, fn => fn()]", () => {
    const [isPending, startTransition] = useTransition()
    expect(isPending).toBe(false)
    let ran = false
    startTransition(() => {
      ran = true
    })
    expect(ran).toBe(true)
  })
})

// ─── useDeferredValue ─────────────────────────────────────────────────────────

describe("useDeferredValue", () => {
  test("returns value as-is", () => {
    expect(useDeferredValue(42)).toBe(42)
    expect(useDeferredValue("hello")).toBe("hello")
    const obj = { a: 1 }
    expect(useDeferredValue(obj)).toBe(obj)
  })
})

// ─── useId ────────────────────────────────────────────────────────────────────

describe("useId", () => {
  test("returns a unique string", () => {
    const id1 = useId()
    const id2 = useId()
    expect(typeof id1).toBe("string")
    expect(typeof id2).toBe("string")
    expect(id1.startsWith(":r")).toBe(true)
    expect(id2.startsWith(":r")).toBe(true)
  })

  test("returns deterministic IDs within a component", () => {
    const el = container()
    const ids: string[] = []

    const Comp = () => {
      ids.push(useId())
      ids.push(useId())
      return h("div", null, "id-test")
    }

    const unmount = mount(h(Comp, null), el)
    expect(ids).toHaveLength(2)
    expect(ids[0]).toBe(":r0:")
    expect(ids[1]).toBe(":r1:")
    unmount()
  })

  test("different components get independent counters", () => {
    const el = container()
    const ids1: string[] = []
    const ids2: string[] = []

    const Comp1 = () => {
      ids1.push(useId())
      return h("div", null, "c1")
    }
    const Comp2 = () => {
      ids2.push(useId())
      return h("div", null, "c2")
    }

    const unmount = mount(h("div", null, h(Comp1, null), h(Comp2, null)), el)
    expect(ids1[0]).toBe(":r0:")
    expect(ids2[0]).toBe(":r0:")
    unmount()
  })
})

// ─── createPortal ─────────────────────────────────────────────────────────────

describe("createPortal", () => {
  test("creates a portal VNode that renders into target", () => {
    const src = container()
    const target = container()
    mount(createPortal(h("span", null, "portaled"), target), src)
    expect(target.querySelector("span")?.textContent).toBe("portaled")
    expect(src.querySelector("span")).toBeNull()
  })
})

// ─── lazy ─────────────────────────────────────────────────────────────────────

describe("lazy", () => {
  test("returns a component that loads async", async () => {
    const MyComp = (props: { text: string }) => h("p", null, props.text)
    const Lazy = lazy(() => Promise.resolve({ default: MyComp }))

    expect(Lazy({ text: "hello" })).toBeNull()

    await new Promise<void>((r) => setTimeout(r, 10))
    const result = Lazy({ text: "hello" })
    expect(result).not.toBeNull()
  })

  test("__loading reports loading state", async () => {
    const MyComp = () => h("div", null, "loaded")
    const Lazy = lazy(() => Promise.resolve({ default: MyComp }))
    expect(Lazy.__loading()).toBe(true)
    await new Promise<void>((r) => setTimeout(r, 10))
    expect(Lazy.__loading()).toBe(false)
  })
})

// ─── batch ────────────────────────────────────────────────────────────────────

describe("batch", () => {
  test("groups multiple signal updates into one flush", () => {
    const a = signal(0)
    const b = signal(0)
    let runs = 0
    effect(() => {
      a()
      b()
      runs++
    })
    expect(runs).toBe(1)
    batch(() => {
      a.set(1)
      b.set(1)
    })
    expect(runs).toBe(2)
  })
})

// ─── createRoot (dom.ts) ──────────────────────────────────────────────────────

describe("createRoot", () => {
  test("render mounts element into container", () => {
    const el = container()
    const root = createRoot(el)
    root.render(h("div", { id: "root-test" }, "hello"))
    expect(el.querySelector("#root-test")?.textContent).toBe("hello")
  })

  test("unmount removes content", () => {
    const el = container()
    const root = createRoot(el)
    root.render(h("p", null, "mounted"))
    expect(el.querySelector("p")).not.toBeNull()
    root.unmount()
    expect(el.innerHTML).toBe("")
  })

  test("re-render replaces previous content", () => {
    const el = container()
    const root = createRoot(el)
    root.render(h("span", null, "first"))
    expect(el.textContent).toBe("first")
    root.render(h("span", null, "second"))
    expect(el.textContent).toBe("second")
  })

  test("unmount after unmount is safe (no-op)", () => {
    const el = container()
    const root = createRoot(el)
    root.render(h("div", null, "x"))
    root.unmount()
    root.unmount()
    expect(el.innerHTML).toBe("")
  })
})

// ─── render (dom.ts) ──────────────────────────────────────────────────────────

describe("render", () => {
  test("mounts element into container", () => {
    const el = container()
    render(h("div", { id: "render-test" }, "world"), el)
    expect(el.querySelector("#render-test")?.textContent).toBe("world")
  })
})

// ─── useImperativeHandle ─────────────────────────────────────────────────────

describe("useImperativeHandle", () => {
  test("sets ref.current on mount", () => {
    const el = container()
    const ref = { current: null as { greet: () => string } | null }

    const Comp = () => {
      useImperativeHandle(ref, () => ({
        greet: () => "hello",
      }))
      return h("div", null, "imp")
    }

    const unmount = mount(h(Comp, null), el)
    expect(ref.current).not.toBeNull()
    expect(ref.current?.greet()).toBe("hello")
    unmount()
  })

  test("does not clear ref.current on unmount (onUnmount inside onMount is no-op)", () => {
    const el = container()
    const ref = { current: null as { value: number } | null }

    const Comp = () => {
      useImperativeHandle(ref, () => ({ value: 42 }))
      return h("div", null, "imp")
    }

    const unmount = mount(h(Comp, null), el)
    expect(ref.current).not.toBeNull()
    expect(ref.current?.value).toBe(42)
    unmount()
    // onUnmount called inside onMount callback is a no-op (hooks context
    // is not active during mount-hook execution), so ref is not cleared.
    expect(ref.current).not.toBeNull()
  })

  test("no-op when ref is null", () => {
    const el = container()

    const Comp = () => {
      useImperativeHandle(null, () => ({ value: 42 }))
      return h("div", null, "no-ref")
    }

    const unmount = mount(h(Comp, null), el)
    unmount()
  })

  test("no-op when ref is undefined", () => {
    const el = container()

    const Comp = () => {
      useImperativeHandle(undefined, () => ({ value: 42 }))
      return h("div", null, "undef-ref")
    }

    const unmount = mount(h(Comp, null), el)
    unmount()
  })
})

// ─── Re-exports ───────────────────────────────────────────────────────────────

describe("re-exports", () => {
  test("createElement is h", () => {
    expect(createElement).toBe(h)
  })

  test("Fragment is exported", () => {
    expect(typeof Fragment).toBe("symbol")
  })

  test("createContext creates context with default", () => {
    const Ctx = createContext("default")
    expect(useContext(Ctx)).toBe("default")
  })

  test("useContext reads from context", () => {
    const Ctx = createContext(42)
    expect(useContext(Ctx)).toBe(42)
  })

  test("Suspense is exported", () => {
    expect(typeof Suspense).toBe("function")
  })

  test("ErrorBoundary is exported", () => {
    expect(typeof ErrorBoundary).toBe("function")
  })

  test("useErrorBoundary is a function", () => {
    expect(typeof useErrorBoundary).toBe("function")
  })

  test("createSelector is a function", () => {
    expect(typeof createSelector).toBe("function")
  })

  test("onMount is a function", () => {
    expect(typeof onMount).toBe("function")
  })

  test("onUnmount is a function", () => {
    expect(typeof onUnmount).toBe("function")
  })

  test("onUpdate is a function", () => {
    expect(typeof onUpdate).toBe("function")
  })

  test("useLayoutEffect is exported from core", () => {
    expect(typeof useLayoutEffect).toBe("function")
  })

  test("useLayoutEffect_ is same as useEffect", () => {
    expect(useLayoutEffect_).toBe(useEffect)
  })
})

// ─── Additional coverage: useId outside scope ──────────────────────────────

describe("useId — no scope fallback", () => {
  test("returns random-ish id when called outside a component (no scope)", () => {
    // getCurrentScope() returns null outside a component, hitting the fallback branch
    const id = useId()
    expect(typeof id).toBe("string")
    expect(id.startsWith(":r")).toBe(true)
    expect(id.endsWith(":")).toBe(true)
    // Two calls should produce different IDs (random)
    const id2 = useId()
    expect(id).not.toBe(id2)
  })
})

// ─── Additional coverage: useEffect with non-empty deps ─────────────────────

describe("useEffect — non-empty deps array", () => {
  test("with non-empty deps array, still runs reactively (deps ignored)", () => {
    const el = container()
    const s = signal(0)
    let runs = 0

    const Comp = () => {
      useEffect(() => {
        s()
        runs++
      }, [s])
      return h("div", null, "non-empty-deps")
    }

    const unmount = mount(h(Comp, null), el)
    expect(runs).toBe(1)
    s.set(1)
    expect(runs).toBe(2)
    unmount()
  })

  test("with non-empty deps and cleanup, cleanup runs on re-execution", () => {
    const el = container()
    const s = signal(0)
    let cleanups = 0

    const Comp = () => {
      useEffect(() => {
        s()
        return () => {
          cleanups++
        }
      }, [s])
      return h("div", null, "cleanup-deps")
    }

    const unmount = mount(h(Comp, null), el)
    expect(cleanups).toBe(0)
    s.set(1) // re-runs effect, previous cleanup should fire
    expect(cleanups).toBe(1)
    unmount()
  })
})

// ─── Additional coverage: useState with non-function initial ─────────────────

describe("useState — edge cases", () => {
  test("with function-valued non-initializer (explicit type)", () => {
    // When T is not a function type, direct value is used
    const [val] = useState("hello")
    expect(val()).toBe("hello")
  })
})

// ─── Additional coverage: useReducer with non-function initial ───────────────

describe("useReducer — edge cases", () => {
  test("with non-function initial value", () => {
    const [state] = useReducer((s: string, a: string) => s + a, "start")
    expect(state()).toBe("start")
  })
})
