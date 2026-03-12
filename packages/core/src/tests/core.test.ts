import {
  createContext,
  createRef,
  defineComponent,
  dispatchToErrorBoundary,
  Dynamic,
  ErrorBoundary,
  For,
  ForSymbol,
  Fragment,
  h,
  lazy,
  Match,
  MatchSymbol,
  mapArray,
  onErrorCaptured,
  onMount,
  onUnmount,
  onUpdate,
  Portal,
  PortalSymbol,
  popContext,
  propagateError,
  pushContext,
  registerErrorHandler,
  reportError,
  runWithHooks,
  Show,
  Suspense,
  Switch,
  useContext,
  withContext,
} from "../index"
import { jsxDEV } from "../jsx-dev-runtime"
import { Fragment as JsxFragment, jsx, jsxs } from "../jsx-runtime"
import type { ComponentFn, VNode, VNodeChild } from "../types"

// ─── h() ─────────────────────────────────────────────────────────────────────

describe("h()", () => {
  test("creates a VNode with string type", () => {
    const node = h("div", null)
    expect(node.type).toBe("div")
    expect(node.props).toEqual({})
    expect(node.children).toEqual([])
    expect(node.key).toBeNull()
  })

  test("passes props through", () => {
    const node = h("div", { class: "foo", id: "bar" })
    expect(node.props).toEqual({ class: "foo", id: "bar" })
  })

  test("extracts key from props", () => {
    const node = h("li", { key: "item-1" })
    expect(node.key).toBe("item-1")
  })

  test("numeric key", () => {
    const node = h("li", { key: 42 })
    expect(node.key).toBe(42)
  })

  test("null props becomes empty object", () => {
    const node = h("span", null)
    expect(node.props).toEqual({})
  })

  test("children are stored in vnode.children", () => {
    const node = h("div", null, "hello", "world")
    expect(node.children).toEqual(["hello", "world"])
  })

  test("nested array children are flattened", () => {
    const node = h("ul", null, [h("li", null, "a"), h("li", null, "b")])
    expect(node.children).toHaveLength(2)
    expect((node.children[0] as VNode).type).toBe("li")
    expect((node.children[1] as VNode).type).toBe("li")
  })

  test("deeply nested arrays are flattened", () => {
    const node = h("div", null, [[["deep"]]] as unknown as VNodeChild)
    expect(node.children).toEqual(["deep"])
  })

  test("handles boolean/null/undefined children", () => {
    const node = h("div", null, true, false, null, undefined, "text")
    expect(node.children).toEqual([true, false, null, undefined, "text"])
  })

  test("handles component function type", () => {
    const Comp = ((props: { name: string }) => h("span", null, props.name)) as ComponentFn<{
      name: string
    }>
    const node = h(Comp, { name: "test" })
    expect(node.type as unknown).toBe(Comp)
    expect(node.props).toEqual({ name: "test" })
  })

  test("handles symbol type (Fragment)", () => {
    const node = h(Fragment, null, "a", "b")
    expect(node.type).toBe(Fragment)
    expect(node.children).toEqual(["a", "b"])
  })

  test("function children are preserved (reactive getters)", () => {
    const getter = () => "dynamic"
    const node = h("div", null, getter)
    expect(node.children).toHaveLength(1)
    expect(typeof node.children[0]).toBe("function")
    expect((node.children[0] as () => string)()).toBe("dynamic")
  })

  test("VNode children are preserved", () => {
    const child = h("span", null, "inner")
    const parent = h("div", null, child)
    expect(parent.children).toHaveLength(1)
    expect((parent.children[0] as VNode).type).toBe("span")
  })
})

// ─── Fragment ────────────────────────────────────────────────────────────────

describe("Fragment", () => {
  test("is a symbol", () => {
    expect(typeof Fragment).toBe("symbol")
  })

  test("Fragment VNode wraps children without a DOM element", () => {
    const node = h(Fragment, null, h("span", null, "a"), h("span", null, "b"))
    expect(node.type).toBe(Fragment)
    expect(node.children).toHaveLength(2)
  })
})

// ─── defineComponent ────────────────────────────────────────────────────────

describe("defineComponent()", () => {
  test("returns the same function", () => {
    const fn: ComponentFn = () => h("div", null)
    const defined = defineComponent(fn)
    expect(defined).toBe(fn)
  })

  test("preserves typed props", () => {
    const Comp = defineComponent<{ count: number }>((props) => {
      return h("span", null, String(props.count))
    })
    const node = Comp({ count: 5 })
    expect(node).not.toBeNull()
    expect((node as VNode).type).toBe("span")
  })
})

// ─── runWithHooks / lifecycle ────────────────────────────────────────────────

describe("runWithHooks()", () => {
  test("captures lifecycle hooks registered during component execution", () => {
    const mountFn = () => undefined
    const unmountFn = () => {}
    const updateFn = () => {}
    const errorFn = () => true

    const Comp: ComponentFn = () => {
      onMount(mountFn)
      onUnmount(unmountFn)
      onUpdate(updateFn)
      onErrorCaptured(errorFn)
      return h("div", null)
    }

    const { vnode, hooks } = runWithHooks(Comp, {})
    expect(vnode).not.toBeNull()
    expect(hooks.mount).toHaveLength(1)
    expect(hooks.mount[0]).toBe(mountFn)
    expect(hooks.unmount).toHaveLength(1)
    expect(hooks.unmount[0]).toBe(unmountFn)
    expect(hooks.update).toHaveLength(1)
    expect(hooks.update[0]).toBe(updateFn)
    expect(hooks.error).toHaveLength(1)
    expect(hooks.error[0]).toBe(errorFn)
  })

  test("returns null vnode when component returns null", () => {
    const Comp: ComponentFn = () => null
    const { vnode } = runWithHooks(Comp, {})
    expect(vnode).toBeNull()
  })

  test("clears hooks context after execution (hooks outside component are no-ops)", () => {
    const Comp: ComponentFn = () => h("div", null)
    runWithHooks(Comp, {})

    // Calling lifecycle hooks outside a component should not throw
    onMount(() => undefined)
    onUnmount(() => {})
    onUpdate(() => {})
    onErrorCaptured(() => true)
  })

  test("multiple hooks of the same type are all captured", () => {
    const Comp: ComponentFn = () => {
      onMount(() => undefined)
      onMount(() => undefined)
      onMount(() => undefined)
      return h("div", null)
    }

    const { hooks } = runWithHooks(Comp, {})
    expect(hooks.mount).toHaveLength(3)
  })

  test("passes props to component function", () => {
    let received: unknown = null
    const Comp: ComponentFn<{ msg: string }> = (props) => {
      received = props
      return null
    }
    runWithHooks(Comp, { msg: "hello" })
    expect(received).toEqual({ msg: "hello" })
  })
})

// ─── propagateError ──────────────────────────────────────────────────────────

describe("propagateError()", () => {
  test("returns true when handler marks error as handled", () => {
    const hooks = {
      mount: [],
      unmount: [],
      update: [],
      error: [(_err: unknown) => true as boolean | undefined],
    }
    expect(propagateError(new Error("test"), hooks)).toBe(true)
  })

  test("returns false when no handlers", () => {
    const hooks = {
      mount: [],
      unmount: [],
      update: [],
      error: [] as Array<(err: unknown) => boolean | undefined>,
    }
    expect(propagateError(new Error("test"), hooks)).toBe(false)
  })

  test("returns false when handler does not return true", () => {
    const hooks = {
      mount: [],
      unmount: [],
      update: [],
      error: [(_err: unknown) => undefined as boolean | undefined],
    }
    expect(propagateError(new Error("test"), hooks)).toBe(false)
  })

  test("stops at first handler that returns true", () => {
    let secondCalled = false
    const hooks = {
      mount: [],
      unmount: [],
      update: [],
      error: [
        (_err: unknown) => true as boolean | undefined,
        (_err: unknown) => {
          secondCalled = true
          return true as boolean | undefined
        },
      ],
    }
    propagateError(new Error("test"), hooks)
    expect(secondCalled).toBe(false)
  })
})

// ─── Context ─────────────────────────────────────────────────────────────────

describe("createContext / useContext", () => {
  test("createContext returns context with default value", () => {
    const ctx = createContext(42)
    expect(ctx.defaultValue).toBe(42)
    expect(typeof ctx.id).toBe("symbol")
  })

  test("useContext returns default when no provider", () => {
    const ctx = createContext("default-value")
    expect(useContext(ctx)).toBe("default-value")
  })

  test("withContext provides value during callback", () => {
    const ctx = createContext(0)
    let captured = -1
    withContext(ctx, 99, () => {
      captured = useContext(ctx)
    })
    expect(captured).toBe(99)
  })

  test("withContext restores stack after callback (even on throw)", () => {
    const ctx = createContext("original")
    try {
      withContext(ctx, "override", () => {
        throw new Error("boom")
      })
    } catch {}
    expect(useContext(ctx)).toBe("original")
  })

  test("nested contexts override outer", () => {
    const ctx = createContext(0)
    withContext(ctx, 1, () => {
      expect(useContext(ctx)).toBe(1)
      withContext(ctx, 2, () => {
        expect(useContext(ctx)).toBe(2)
      })
      expect(useContext(ctx)).toBe(1)
    })
  })

  test("multiple contexts are independent", () => {
    const ctxA = createContext("a")
    const ctxB = createContext("b")
    withContext(ctxA, "A", () => {
      withContext(ctxB, "B", () => {
        expect(useContext(ctxA)).toBe("A")
        expect(useContext(ctxB)).toBe("B")
      })
    })
  })

  test("pushContext / popContext work directly", () => {
    const ctx = createContext("default")
    const frame = new Map<symbol, unknown>([[ctx.id, "pushed"]])
    pushContext(frame)
    expect(useContext(ctx)).toBe("pushed")
    popContext()
    expect(useContext(ctx)).toBe("default")
  })
})

// ─── createRef ───────────────────────────────────────────────────────────────

describe("createRef()", () => {
  test("returns object with current = null", () => {
    const ref = createRef()
    expect(ref.current).toBeNull()
  })

  test("current is mutable", () => {
    const ref = createRef<number>()
    ref.current = 42
    expect(ref.current).toBe(42)
  })

  test("typed ref works", () => {
    const ref = createRef<string>()
    ref.current = "hello"
    expect(ref.current).toBe("hello")
  })
})

// ─── Show ────────────────────────────────────────────────────────────────────

describe("Show", () => {
  test("returns a reactive getter", () => {
    const result = Show({ when: () => true, children: "visible" })
    expect(typeof result).toBe("function")
  })

  test("returns children when condition is truthy", () => {
    const getter = Show({ when: () => true, children: "visible" }) as unknown as () => VNodeChild
    expect(getter()).toBe("visible")
  })

  test("returns null when condition is falsy and no fallback", () => {
    const getter = Show({ when: () => false, children: "visible" }) as unknown as () => VNodeChild
    expect(getter()).toBeNull()
  })

  test("returns fallback when condition is falsy", () => {
    const fallbackNode = h("span", null, "nope")
    const getter = Show({
      when: () => false,
      fallback: fallbackNode,
      children: "visible",
    }) as unknown as () => VNodeChild
    expect(getter()).toBe(fallbackNode)
  })

  test("reacts to condition changes", () => {
    let flag = true
    const getter = Show({
      when: () => flag,
      children: "yes",
      fallback: "no",
    }) as unknown as () => VNodeChild
    expect(getter()).toBe("yes")
    flag = false
    expect(getter()).toBe("no")
  })

  test("returns null for children when children not provided and condition truthy", () => {
    const getter = Show({ when: () => true }) as unknown as () => VNodeChild
    expect(getter()).toBeNull()
  })
})

// ─── Switch / Match ──────────────────────────────────────────────────────────

describe("Switch / Match", () => {
  test("renders first matching branch", () => {
    const result = Switch({
      children: [
        h(Match, { when: () => false }, "first"),
        h(Match, { when: () => true }, "second"),
        h(Match, { when: () => true }, "third"),
      ],
    })
    const getter = result as unknown as () => VNodeChild
    expect(getter()).toBe("second")
  })

  test("renders fallback when no branch matches", () => {
    const fb = h("p", null, "404")
    const result = Switch({
      fallback: fb,
      children: [h(Match, { when: () => false }, "a"), h(Match, { when: () => false }, "b")],
    })
    const getter = result as unknown as () => VNodeChild
    expect(getter()).toBe(fb)
  })

  test("returns null when no match and no fallback", () => {
    const result = Switch({
      children: [h(Match, { when: () => false }, "a")],
    })
    const getter = result as unknown as () => VNodeChild
    expect(getter()).toBeNull()
  })

  test("handles single child (not array)", () => {
    const result = Switch({
      children: h(Match, { when: () => true }, "only"),
    })
    const getter = result as unknown as () => VNodeChild
    expect(getter()).toBe("only")
  })

  test("handles no children", () => {
    const result = Switch({})
    const getter = result as unknown as () => VNodeChild
    expect(getter()).toBeNull()
  })

  test("Match function returns null (marker only)", () => {
    const result = Match({ when: () => true, children: "content" })
    expect(result).toBeNull()
  })

  test("MatchSymbol is a symbol", () => {
    expect(typeof MatchSymbol).toBe("symbol")
  })

  test("reacts to condition changes", () => {
    let a = false
    let b = false
    const result = Switch({
      fallback: "none",
      children: [h(Match, { when: () => a }, "A"), h(Match, { when: () => b }, "B")],
    })
    const getter = result as unknown as () => VNodeChild
    expect(getter()).toBe("none")
    b = true
    expect(getter()).toBe("B")
    a = true
    expect(getter()).toBe("A") // first match wins
  })

  test("handles multiple children in a Match branch", () => {
    const result = Switch({
      children: [h(Match, { when: () => true }, "child1", "child2")],
    })
    const getter = result as unknown as () => VNodeChild
    const value = getter()
    expect(Array.isArray(value)).toBe(true)
    expect(value as unknown).toEqual(["child1", "child2"])
  })
})

// ─── For ─────────────────────────────────────────────────────────────────────

describe("For()", () => {
  test("returns a VNode with ForSymbol type", () => {
    const node = For({
      each: () => [1, 2, 3],
      key: (item) => item,
      children: (item) => h("li", null, String(item)),
    })
    expect(node.type).toBe(ForSymbol)
    expect(node.children).toEqual([])
    expect(node.key).toBeNull()
  })

  test("ForSymbol is a symbol", () => {
    expect(typeof ForSymbol).toBe("symbol")
  })

  test("props contain each, by, children functions", () => {
    const eachFn = () => [1, 2]
    const keyFn = (item: number) => item
    const childFn = (item: number) => h("span", null, String(item))
    const node = For({ each: eachFn, by: keyFn, children: childFn })
    const props = node.props as unknown as {
      each: typeof eachFn
      by: typeof keyFn
      children: typeof childFn
    }
    expect(props.each).toBe(eachFn)
    expect(props.by).toBe(keyFn)
    expect(props.children).toBe(childFn)
  })
})

// ─── Portal ──────────────────────────────────────────────────────────────────

describe("Portal()", () => {
  test("returns a VNode with PortalSymbol type", () => {
    const fakeTarget = {} as Element
    const node = Portal({ target: fakeTarget, children: h("div", null) })
    expect(node.type).toBe(PortalSymbol)
    expect(node.key).toBeNull()
    expect(node.children).toEqual([])
  })

  test("PortalSymbol is a symbol", () => {
    expect(typeof PortalSymbol).toBe("symbol")
  })

  test("props contain target and children", () => {
    const fakeTarget = {} as Element
    const child = h("span", null, "content")
    const node = Portal({ target: fakeTarget, children: child })
    const props = node.props as unknown as { target: Element; children: VNode }
    expect(props.target).toBe(fakeTarget)
    expect(props.children).toBe(child)
  })
})

// ─── Suspense ────────────────────────────────────────────────────────────────

describe("Suspense", () => {
  test("returns a Fragment VNode", () => {
    const node = Suspense({
      fallback: h("div", null, "loading..."),
      children: h("div", null, "content"),
    })
    expect(node.type).toBe(Fragment)
  })

  test("renders children when not loading", () => {
    const child = h("div", null, "loaded")
    const node = Suspense({
      fallback: h("span", null, "loading"),
      children: child,
    })
    // The child of Fragment is a reactive getter
    expect(node.children).toHaveLength(1)
    const getter = node.children[0] as () => VNodeChild
    expect(typeof getter).toBe("function")
    // Should return the child since it's not a lazy component
    expect(getter()).toBe(child)
  })

  test("renders fallback when child type has __loading() returning true", () => {
    const fallback = h("span", null, "loading")
    const lazyFn = (() => h("div", null)) as unknown as ComponentFn & { __loading: () => boolean }
    lazyFn.__loading = () => true
    const child = h(lazyFn, null)

    const node = Suspense({ fallback, children: child })
    const getter = node.children[0] as () => VNodeChild
    expect(getter()).toBe(fallback)
  })

  test("renders children when __loading returns false", () => {
    const fallback = h("span", null, "loading")
    const lazyFn = (() => h("div", null)) as unknown as ComponentFn & { __loading: () => boolean }
    lazyFn.__loading = () => false
    const child = h(lazyFn, null)

    const node = Suspense({ fallback, children: child })
    const getter = node.children[0] as () => VNodeChild
    expect(getter()).toBe(child)
  })

  test("handles function children (reactive getter)", () => {
    const child = h("div", null, "content")
    const node = Suspense({
      fallback: h("span", null, "loading"),
      children: () => child,
    })
    const getter = node.children[0] as () => VNodeChild
    // The getter should unwrap the function child
    expect(getter()).toBe(child)
  })
})

// ─── ErrorBoundary ───────────────────────────────────────────────────────────

describe("ErrorBoundary", () => {
  test("is a component function", () => {
    expect(typeof ErrorBoundary).toBe("function")
  })

  test("returns a reactive getter", () => {
    // Must run inside runWithHooks since ErrorBoundary calls onUnmount
    const { vnode, hooks } = runWithHooks(() => {
      return h(
        "div",
        null,
        ErrorBoundary({
          fallback: (err) => `Error: ${err}`,
          children: "child content",
        }) as VNodeChild,
      )
    }, {})
    expect(vnode).not.toBeNull()
    // Should have registered onUnmount for cleanup
    expect(hooks.unmount.length).toBeGreaterThanOrEqual(1)
  })

  test("renders children when no error", () => {
    let result: VNodeChild = null
    runWithHooks(() => {
      result = ErrorBoundary({
        fallback: (err) => `Error: ${err}`,
        children: "child content",
      })
      return null
    }, {})
    expect(typeof result).toBe("function")
    const getter = result as unknown as () => VNodeChild
    expect(getter()).toBe("child content")
  })

  test("renders function children by calling them", () => {
    let result: VNodeChild = null
    runWithHooks(() => {
      result = ErrorBoundary({
        fallback: (err) => `Error: ${err}`,
        children: () => "dynamic child",
      })
      return null
    }, {})
    const getter = result as unknown as () => VNodeChild
    expect(getter()).toBe("dynamic child")
  })
})

// ─── dispatchToErrorBoundary ─────────────────────────────────────────────────

describe("dispatchToErrorBoundary()", () => {
  test("dispatches to the most recently pushed boundary", async () => {
    // Previous ErrorBoundary tests may have left handlers on the stack,
    // so we test by pushing our own known handler.
    let caughtErr: unknown = null
    const { pushErrorBoundary: push, popErrorBoundary: pop } = await import("../component")
    push((err: unknown) => {
      caughtErr = err
      return true
    })
    expect(dispatchToErrorBoundary(new Error("caught"))).toBe(true)
    expect((caughtErr as Error).message).toBe("caught")
    pop()
  })
})

// ─── mapArray ────────────────────────────────────────────────────────────────

describe("mapArray()", () => {
  test("maps items with caching", () => {
    let callCount = 0
    const items = [1, 2, 3]
    const mapped = mapArray(
      () => items,
      (item) => item,
      (item) => {
        callCount++
        return item * 10
      },
    )

    const result1 = mapped()
    expect(result1).toEqual([10, 20, 30])
    expect(callCount).toBe(3)

    // Second call should use cache
    const result2 = mapped()
    expect(result2).toEqual([10, 20, 30])
    expect(callCount).toBe(3) // no new calls
  })

  test("only maps new keys on update", () => {
    let callCount = 0
    let items = [1, 2, 3]
    const mapped = mapArray(
      () => items,
      (item) => item,
      (item) => {
        callCount++
        return item * 10
      },
    )

    mapped() // initial: 3 calls
    expect(callCount).toBe(3)

    items = [1, 2, 3, 4]
    mapped() // only item 4 is new
    expect(callCount).toBe(4)
  })

  test("evicts removed keys", () => {
    let items = [1, 2, 3]
    const mapped = mapArray(
      () => items,
      (item) => item,
      (item) => item * 10,
    )

    mapped()
    items = [1, 3] // remove key 2
    const result = mapped()
    expect(result).toEqual([10, 30])

    // Re-add key 2 — should re-map since it was evicted
    let callCount = 0
    items = [1, 2, 3]
    const mapped2 = mapArray(
      () => items,
      (item) => item,
      (item) => {
        callCount++
        return item * 100
      },
    )
    mapped2()
    expect(callCount).toBe(3)
  })

  test("handles empty source", () => {
    const mapped = mapArray(
      () => [],
      (item: number) => item,
      (item) => item * 10,
    )
    expect(mapped()).toEqual([])
  })

  test("handles reordering", () => {
    let items = [1, 2, 3]
    let callCount = 0
    const mapped = mapArray(
      () => items,
      (item) => item,
      (item) => {
        callCount++
        return item * 10
      },
    )

    mapped()
    expect(callCount).toBe(3)

    items = [3, 1, 2] // reorder
    const result = mapped()
    expect(result).toEqual([30, 10, 20])
    expect(callCount).toBe(3) // no new calls — all cached
  })
})

// ─── Telemetry ───────────────────────────────────────────────────────────────

describe("registerErrorHandler / reportError", () => {
  test("registerErrorHandler registers and calls handler", () => {
    const errors: unknown[] = []
    const unregister = registerErrorHandler((ctx) => {
      errors.push(ctx.error)
    })

    reportError({ component: "Test", phase: "render", error: "boom", timestamp: Date.now() })
    expect(errors).toEqual(["boom"])

    unregister()
    reportError({ component: "Test", phase: "render", error: "after", timestamp: Date.now() })
    expect(errors).toEqual(["boom"]) // not called after unregister
  })

  test("multiple handlers are all called", () => {
    let count = 0
    const unsub1 = registerErrorHandler(() => {
      count++
    })
    const unsub2 = registerErrorHandler(() => {
      count++
    })

    reportError({ component: "X", phase: "setup", error: "err", timestamp: 0 })
    expect(count).toBe(2)

    unsub1()
    unsub2()
  })

  test("handler errors are swallowed", () => {
    let secondCalled = false
    const unsub1 = registerErrorHandler(() => {
      throw new Error("handler crash")
    })
    const unsub2 = registerErrorHandler(() => {
      secondCalled = true
    })

    // Should not throw
    reportError({ component: "Y", phase: "mount", error: "err", timestamp: 0 })
    expect(secondCalled).toBe(true)

    unsub1()
    unsub2()
  })
})

// ─── JSX Runtime ─────────────────────────────────────────────────────────────

describe("jsx / jsxs / jsxDEV", () => {
  test("jsx creates VNode for DOM element", () => {
    const node = jsx("div", { class: "x" })
    expect(node.type).toBe("div")
    expect(node.props).toEqual({ class: "x" })
    expect(node.children).toEqual([])
  })

  test("jsx handles children in props for DOM elements", () => {
    const node = jsx("div", { children: "hello" })
    expect(node.children).toEqual(["hello"])
    // children should not be in props for DOM elements
    expect(node.props).toEqual({})
  })

  test("jsx handles array children for DOM elements", () => {
    const node = jsx("div", { children: ["a", "b", "c"] })
    expect(node.children).toEqual(["a", "b", "c"])
  })

  test("jsx passes children in props for component functions", () => {
    const Comp: ComponentFn = (props) => h("span", null, String(props.children))
    const node = jsx(Comp, { children: "content" })
    expect(node.type).toBe(Comp)
    // For components, children stay in props
    expect(node.props.children).toBe("content")
    expect(node.children).toEqual([])
  })

  test("jsx handles key parameter", () => {
    const node = jsx("li", { id: "x" }, "my-key")
    expect(node.key).toBe("my-key")
    // key is added to props by jsx runtime
    expect(node.props).toEqual({ id: "x", key: "my-key" })
  })

  test("jsx handles Fragment (symbol type) with children", () => {
    const node = jsx(Fragment, { children: ["a", "b"] })
    expect(node.type).toBe(Fragment)
    expect(node.children).toEqual(["a", "b"])
  })

  test("jsxs is the same as jsx", () => {
    expect(jsxs).toBe(jsx)
  })

  test("jsxDEV is the same as jsx", () => {
    expect(jsxDEV).toBe(jsx)
  })

  test("JsxFragment is the same as Fragment", () => {
    expect(JsxFragment).toBe(Fragment)
  })

  test("jsx with no children in props", () => {
    const node = jsx("span", { id: "test" })
    expect(node.children).toEqual([])
    expect(node.props).toEqual({ id: "test" })
  })

  test("jsx component with no children", () => {
    const Comp: ComponentFn = () => null
    const node = jsx(Comp, { name: "test" })
    expect(node.props).toEqual({ name: "test" })
    // children should not be injected if not provided
    expect(node.props.children).toBeUndefined()
  })
})

// ─── Lifecycle hooks outside component ───────────────────────────────────────

describe("lifecycle hooks", () => {
  test("onMount outside component is a no-op", () => {
    expect(() => onMount(() => undefined)).not.toThrow()
  })

  test("onUnmount outside component is a no-op", () => {
    expect(() => onUnmount(() => {})).not.toThrow()
  })

  test("onUpdate outside component is a no-op", () => {
    expect(() => onUpdate(() => {})).not.toThrow()
  })

  test("onErrorCaptured outside component is a no-op", () => {
    expect(() => onErrorCaptured(() => true)).not.toThrow()
  })
})

// ─── Edge cases ──────────────────────────────────────────────────────────────

describe("edge cases", () => {
  test("h() with empty children array", () => {
    const node = h("div", null, ...[])
    expect(node.children).toEqual([])
  })

  test("h() with mixed children types", () => {
    const node = h("div", null, "text", 42, h("span", null), null, () => "reactive")
    expect(node.children).toHaveLength(5)
    expect(node.children[0]).toBe("text")
    expect(node.children[1]).toBe(42)
    expect((node.children[2] as VNode).type).toBe("span")
    expect(node.children[3]).toBeNull()
    expect(typeof node.children[4]).toBe("function")
  })

  test("nested Fragments", () => {
    const node = h(Fragment, null, h(Fragment, null, "a", "b"), h(Fragment, null, "c"))
    expect(node.type).toBe(Fragment)
    expect(node.children).toHaveLength(2)
    expect((node.children[0] as VNode).type).toBe(Fragment)
    expect((node.children[1] as VNode).type).toBe(Fragment)
  })

  test("component that throws during setup is propagated by runWithHooks", () => {
    const Comp: ComponentFn = () => {
      throw new Error("setup error")
    }
    expect(() => runWithHooks(Comp, {})).toThrow("setup error")
  })

  test("createContext with undefined default", () => {
    const ctx = createContext<string | undefined>(undefined)
    expect(ctx.defaultValue).toBeUndefined()
    expect(useContext(ctx)).toBeUndefined()
  })

  test("createContext with object default", () => {
    const defaultObj = { a: 1, b: "two" }
    const ctx = createContext(defaultObj)
    expect(useContext(ctx)).toBe(defaultObj)
  })

  test("Show with VNode children", () => {
    const child = h("div", null, "content")
    const getter = Show({ when: () => true, children: child }) as unknown as () => VNodeChild
    expect(getter()).toBe(child)
  })

  test("For with objects", () => {
    const items = [
      { id: 1, name: "a" },
      { id: 2, name: "b" },
    ]
    const node = For({
      each: () => items,
      key: (item) => item.id,
      children: (item) => h("span", null, item.name),
    })
    expect(node.type).toBe(ForSymbol)
    const props = node.props as unknown as { each: () => typeof items }
    expect(props.each()).toBe(items)
  })
})

// ─── lazy() ───────────────────────────────────────────────────────────────────

describe("lazy()", () => {
  test("returns a LazyComponent with __loading flag", () => {
    const Comp = lazy(() => new Promise(() => {})) // never resolves
    expect(typeof Comp).toBe("function")
    expect(typeof Comp.__loading).toBe("function")
    expect(Comp.__loading()).toBe(true)
  })

  test("resolves to the loaded component", async () => {
    const Inner: ComponentFn<{ name: string }> = (props) => h("span", null, props.name)
    const Comp = lazy(() => Promise.resolve({ default: Inner }))

    // Wait for microtask to resolve
    await new Promise((r) => setTimeout(r, 0))

    expect(Comp.__loading()).toBe(false)
    const result = Comp({ name: "hello" })
    expect(result).not.toBeNull()
    // lazy wraps via h(comp, props) so type is the component function
    expect((result as VNode).type).toBe(Inner)
  })

  test("throws on import error so ErrorBoundary can catch", async () => {
    const Comp = lazy(() => Promise.reject(new Error("load failed")))

    await new Promise((r) => setTimeout(r, 0))

    expect(Comp.__loading()).toBe(false)
    expect(() => Comp({})).toThrow("load failed")
  })

  test("wraps non-Error rejection in Error", async () => {
    const Comp = lazy(() => Promise.reject("string error"))

    await new Promise((r) => setTimeout(r, 0))

    expect(() => Comp({})).toThrow("string error")
  })
})

// ─── setContextStackProvider ──────────────────────────────────────────────────

describe("setContextStackProvider", () => {
  test("allows overriding the context stack provider", async () => {
    const { setContextStackProvider } = await import("../context")
    const customStack: Map<symbol, unknown>[] = []
    const ctx = createContext("custom-default")

    // Override with custom stack
    setContextStackProvider(() => customStack)

    // Push onto custom stack
    customStack.push(new Map([[ctx.id, "custom-value"]]))
    expect(useContext(ctx)).toBe("custom-value")
    customStack.pop()
    expect(useContext(ctx)).toBe("custom-default")

    // Fully restore to module-level default stack
    const { setContextStackProvider: restore } = await import("../context")
    const _defaultStack: Map<symbol, unknown>[] = []
    restore(() => _defaultStack)
  })
})

// ─── ErrorBoundary advanced ──────────────────────────────────────────────────

describe("ErrorBoundary — advanced", () => {
  test("handler returns false when already in error state (double error)", () => {
    let result: VNodeChild = null

    runWithHooks(() => {
      result = ErrorBoundary({
        fallback: (err) => `Error: ${err}`,
        children: "child",
      })
      return null
    }, {})

    const getter = result as unknown as () => VNodeChild
    expect(getter()).toBe("child")

    // First error should be handled
    const handled1 = dispatchToErrorBoundary(new Error("first"))
    expect(handled1).toBe(true)
    expect(getter()).toBe("Error: Error: first")

    // Second error while already in error state should NOT be handled
    const handled2 = dispatchToErrorBoundary(new Error("second"))
    expect(handled2).toBe(false)

    // Clean up the boundary
    const { popErrorBoundary: pop } = require("../component")
    pop()
  })

  test("reset function clears error and re-renders children", () => {
    let result: VNodeChild = null
    let capturedReset: (() => void) | undefined

    runWithHooks(() => {
      result = ErrorBoundary({
        fallback: (err, reset) => {
          capturedReset = reset
          return `Error: ${err}`
        },
        children: "child content",
      })
      return null
    }, {})

    const getter = result as unknown as () => VNodeChild
    expect(getter()).toBe("child content")

    // Trigger error
    dispatchToErrorBoundary(new Error("test error"))
    expect(getter()).toBe("Error: Error: test error")
    expect(capturedReset).toBeDefined()

    // Reset
    capturedReset!()
    expect(getter()).toBe("child content")

    // Clean up
    const { popErrorBoundary: pop } = require("../component")
    pop()
  })
})

// ─── Suspense advanced ──────────────────────────────────────────────────────

describe("Suspense — advanced", () => {
  test("evaluates function fallback when child is loading", () => {
    const fallbackVNode = h("div", null, "fb-content")
    const lazyFn = (() => h("div", null)) as unknown as ComponentFn & { __loading: () => boolean }
    lazyFn.__loading = () => true
    const child = h(lazyFn, null)

    const node = Suspense({ fallback: () => fallbackVNode, children: child })
    const getter = node.children[0] as () => VNodeChild
    expect(getter()).toBe(fallbackVNode)
  })

  test("handles null children", () => {
    const node = Suspense({ fallback: h("span", null, "loading") })
    const getter = node.children[0] as () => VNodeChild
    expect(getter()).toBeNull()
  })

  test("handles array children (not loading)", () => {
    const children = [h("div", null, "a"), h("div", null, "b")]
    const node = Suspense({
      fallback: h("span", null, "loading"),
      children: children as unknown as VNodeChild,
    })
    const getter = node.children[0] as () => VNodeChild
    // Array is not a VNode with a type, so isLoading check should be false
    const result = getter()
    expect(result).toBe(children)
  })
})

// ─── Show edge cases ────────────────────────────────────────────────────────

describe("Show — edge cases", () => {
  test("returns null when condition truthy but children is undefined", () => {
    const getter = Show({ when: () => true }) as unknown as () => VNodeChild
    expect(getter()).toBeNull()
  })

  test("returns null when condition falsy and fallback is undefined", () => {
    const getter = Show({ when: () => false }) as unknown as () => VNodeChild
    expect(getter()).toBeNull()
  })
})

// ─── Switch edge cases ──────────────────────────────────────────────────────

describe("Switch — edge cases", () => {
  test("skips non-Match VNode children", () => {
    const result = Switch({
      fallback: "default",
      children: [h("div", null, "not-match"), h(Match, { when: () => true }, "match-child")],
    })
    const getter = result as unknown as () => VNodeChild
    // Should skip the div and match the Match branch
    expect(getter()).toBe("match-child")
  })

  test("skips null children in branches", () => {
    const result = Switch({
      fallback: "default",
      children: [null as unknown as VNodeChild, h(Match, { when: () => true }, "found")],
    })
    const getter = result as unknown as () => VNodeChild
    expect(getter()).toBe("found")
  })

  test("Match with children in props.children (not vnode.children)", () => {
    // When using explicit props.children instead of h() rest args
    const matchVNode = {
      type: Match,
      props: { when: () => true, children: "from-props" },
      children: [],
      key: null,
    } as unknown as VNodeChild
    const result = Switch({ children: [matchVNode] })
    const getter = result as unknown as () => VNodeChild
    expect(getter()).toBe("from-props")
  })
})

// ─── Dynamic ──────────────────────────────────────────────────────────────────

describe("Dynamic", () => {
  test("renders the given component", () => {
    const Greeting: ComponentFn<{ name: string }> = (props) => h("span", null, props.name)
    const result = Dynamic({ component: Greeting, name: "world" })
    expect(result).not.toBeNull()
    expect((result as VNode).type).toBe(Greeting)
    expect((result as VNode).props).toEqual({ name: "world" })
  })

  test("renders a string element", () => {
    const result = Dynamic({ component: "div", class: "box" })
    expect(result).not.toBeNull()
    expect((result as VNode).type).toBe("div")
    expect((result as VNode).props).toEqual({ class: "box" })
  })

  test("returns null when component is falsy", () => {
    const result = Dynamic({ component: "" })
    expect(result).toBeNull()
  })
})
