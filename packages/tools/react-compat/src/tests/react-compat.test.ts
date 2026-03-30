import { h } from "@pyreon/core";
import { effect, signal } from "@pyreon/reactivity";
import { mount } from "@pyreon/runtime-dom";
import { createRoot, render } from "../dom";
import {
  batch,
  createContext,
  createElement,
  createPortal,
  ErrorBoundary,
  Fragment,
  lazy,
  memo,
  Suspense,
  useCallback,
  useContext,
  useDeferredValue,
  useEffect,
  useId,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  useTransition,
} from "../index";
import type { RenderContext } from "../jsx-runtime";
import { beginRender, endRender, jsx } from "../jsx-runtime";

function container(): HTMLElement {
  const el = document.createElement("div");
  document.body.appendChild(el);
  return el;
}

/** Helper: creates a RenderContext for testing hooks outside of full render cycle */
function withHookCtx<T>(fn: () => T): T {
  const ctx: RenderContext = {
    hooks: [],
    scheduleRerender: () => {},
    pendingEffects: [],
    pendingLayoutEffects: [],
    unmounted: false,
  };
  beginRender(ctx);
  const result = fn();
  endRender();
  return result;
}

/** Re-render helper: calls fn with the same ctx to simulate re-render */
function createHookRunner() {
  const ctx: RenderContext = {
    hooks: [],
    scheduleRerender: () => {},
    pendingEffects: [],
    pendingLayoutEffects: [],
    unmounted: false,
  };
  return {
    ctx,
    run<T>(fn: () => T): T {
      beginRender(ctx);
      const result = fn();
      endRender();
      return result;
    },
  };
}

// ─── useState ─────────────────────────────────────────────────────────────────

describe("useState", () => {
  test("returns [value, setter] — value is the initial value", () => {
    const [count] = withHookCtx(() => useState(0));
    expect(count).toBe(0);
  });

  test("setter updates value on re-render", () => {
    const runner = createHookRunner();
    const [, setCount] = runner.run(() => useState(0));
    setCount(5);
    const [count2] = runner.run(() => useState(0));
    expect(count2).toBe(5);
  });

  test("setter with function updater", () => {
    const runner = createHookRunner();
    const [, setCount] = runner.run(() => useState(10));
    setCount((prev) => prev + 1);
    const [count2] = runner.run(() => useState(10));
    expect(count2).toBe(11);
  });

  test("initializer function is called once", () => {
    let calls = 0;
    const runner = createHookRunner();
    runner.run(() =>
      useState(() => {
        calls++;
        return 42;
      }),
    );
    expect(calls).toBe(1);
    // Second render — initializer should NOT be called again
    runner.run(() =>
      useState(() => {
        calls++;
        return 42;
      }),
    );
    expect(calls).toBe(1);
  });

  test("setter does nothing when value is the same (Object.is)", () => {
    const runner = createHookRunner();
    let rerenders = 0;
    runner.ctx.scheduleRerender = () => {
      rerenders++;
    };
    const [, setCount] = runner.run(() => useState(0));
    setCount(0); // same value
    expect(rerenders).toBe(0);
    setCount(1); // different value
    expect(rerenders).toBe(1);
  });

  test("re-render in a component via compat JSX runtime", async () => {
    const el = container();
    let renderCount = 0;
    let triggerSet: (v: number | ((p: number) => number)) => void = () => {};

    const Counter = () => {
      const [count, setCount] = useState(0);
      renderCount++;
      triggerSet = setCount;
      return h("span", null, String(count));
    };

    // Use compat jsx() to wrap the component
    const vnode = jsx(Counter, {});
    mount(vnode, el);
    expect(el.textContent).toBe("0");
    // mountChild samples the accessor once (untracked) + effect runs it once = 2 renders
    const initialRenders = renderCount;

    // Trigger state change — should re-render via microtask
    triggerSet(1);
    await new Promise<void>((r) => queueMicrotask(r));
    // Need another microtask for the effect to propagate
    await new Promise<void>((r) => queueMicrotask(r));
    expect(el.textContent).toBe("1");
    expect(renderCount).toBe(initialRenders + 1);
  });
});

// ─── useReducer ───────────────────────────────────────────────────────────────

describe("useReducer", () => {
  test("dispatch applies reducer", () => {
    const runner = createHookRunner();
    type Action = { type: "inc" } | { type: "dec" };
    const reducer = (state: number, action: Action) =>
      action.type === "inc" ? state + 1 : state - 1;

    const [state0, dispatch] = runner.run(() => useReducer(reducer, 0));
    expect(state0).toBe(0);

    dispatch({ type: "inc" });
    const [state1] = runner.run(() => useReducer(reducer, 0));
    expect(state1).toBe(1);

    dispatch({ type: "dec" });
    const [state2] = runner.run(() => useReducer(reducer, 0));
    expect(state2).toBe(0);
  });

  test("initializer function is called once", () => {
    let calls = 0;
    const runner = createHookRunner();
    const [state] = runner.run(() =>
      useReducer(
        (s: number) => s,
        () => {
          calls++;
          return 99;
        },
      ),
    );
    expect(state).toBe(99);
    expect(calls).toBe(1);
    // Second render
    runner.run(() =>
      useReducer(
        (s: number) => s,
        () => {
          calls++;
          return 99;
        },
      ),
    );
    expect(calls).toBe(1);
  });

  test("dispatch does nothing when reducer returns same state", () => {
    const runner = createHookRunner();
    let rerenders = 0;
    runner.ctx.scheduleRerender = () => {
      rerenders++;
    };
    const [, dispatch] = runner.run(() => useReducer((_s: number, _a: string) => 5, 5));
    dispatch("anything"); // reducer returns 5, same as current
    expect(rerenders).toBe(0);
  });
});

// ─── useEffect ────────────────────────────────────────────────────────────────

describe("useEffect", () => {
  test("effect runs after render via compat JSX runtime", async () => {
    const el = container();
    let effectRuns = 0;

    const Comp = () => {
      useEffect(() => {
        effectRuns++;
      });
      return h("div", null, "test");
    };

    mount(jsx(Comp, {}), el);
    // Effects are scheduled via microtask; mountChild samples accessor once + effect runs it
    await new Promise<void>((r) => queueMicrotask(r));
    expect(effectRuns).toBeGreaterThanOrEqual(1);
  });

  test("effect with empty deps runs once", async () => {
    const el = container();
    let effectRuns = 0;
    let triggerSet: (v: number) => void = () => {};

    const Comp = () => {
      const [count, setCount] = useState(0);
      triggerSet = setCount;
      useEffect(() => {
        effectRuns++;
      }, []);
      return h("div", null, String(count));
    };

    mount(jsx(Comp, {}), el);
    await new Promise<void>((r) => queueMicrotask(r));
    expect(effectRuns).toBe(1);

    // Re-render — effect should NOT run again (empty deps)
    triggerSet(1);
    await new Promise<void>((r) => queueMicrotask(r));
    await new Promise<void>((r) => queueMicrotask(r));
    expect(effectRuns).toBe(1);
  });

  test("effect with deps re-runs when deps change", async () => {
    const el = container();
    let effectRuns = 0;
    let triggerSet: (v: number | ((p: number) => number)) => void = () => {};

    const Comp = () => {
      const [count, setCount] = useState(0);
      triggerSet = setCount;
      useEffect(() => {
        effectRuns++;
      }, [count]);
      return h("div", null, String(count));
    };

    mount(jsx(Comp, {}), el);
    await new Promise<void>((r) => queueMicrotask(r));
    expect(effectRuns).toBe(1);

    // Change deps value — effect should re-run
    triggerSet((p) => p + 1);
    await new Promise<void>((r) => queueMicrotask(r));
    await new Promise<void>((r) => queueMicrotask(r));
    await new Promise<void>((r) => queueMicrotask(r));
    expect(effectRuns).toBe(2);
  });

  test("effect cleanup runs before re-execution", async () => {
    const el = container();
    let cleanups = 0;
    let triggerSet: (v: number | ((p: number) => number)) => void = () => {};

    const Comp = () => {
      const [count, setCount] = useState(0);
      triggerSet = setCount;
      useEffect(() => {
        return () => {
          cleanups++;
        };
      }, [count]);
      return h("div", null, String(count));
    };

    mount(jsx(Comp, {}), el);
    await new Promise<void>((r) => queueMicrotask(r));
    expect(cleanups).toBe(0);

    triggerSet((p) => p + 1);
    await new Promise<void>((r) => queueMicrotask(r));
    await new Promise<void>((r) => queueMicrotask(r));
    await new Promise<void>((r) => queueMicrotask(r));
    expect(cleanups).toBe(1);
  });

  test("pendingEffects populated during render", () => {
    const runner = createHookRunner();
    runner.run(() => {
      useEffect(() => {
        /* noop */
      });
    });
    expect(runner.ctx.pendingEffects).toHaveLength(1);
  });

  test("effect with same deps does not re-queue", () => {
    const runner = createHookRunner();
    runner.run(() => {
      useEffect(() => {}, [1, 2]);
    });
    expect(runner.ctx.pendingEffects).toHaveLength(1);

    // Second render with same deps
    runner.run(() => {
      useEffect(() => {}, [1, 2]);
    });
    expect(runner.ctx.pendingEffects).toHaveLength(0);
  });
});

// ─── useLayoutEffect ─────────────────────────────────────────────────────────

describe("useLayoutEffect", () => {
  test("layout effect runs synchronously during render in compat runtime", () => {
    const el = container();
    let effectRuns = 0;

    const Comp = () => {
      useLayoutEffect(() => {
        effectRuns++;
      });
      return h("div", null, "layout");
    };

    mount(jsx(Comp, {}), el);
    // Layout effects run synchronously; mountChild samples + effect = 2 runs
    expect(effectRuns).toBeGreaterThanOrEqual(1);
  });

  test("pendingLayoutEffects populated during render", () => {
    const runner = createHookRunner();
    runner.run(() => {
      useLayoutEffect(() => {});
    });
    expect(runner.ctx.pendingLayoutEffects).toHaveLength(1);
  });

  test("layout effect with same deps does not re-queue", () => {
    const runner = createHookRunner();
    runner.run(() => {
      useLayoutEffect(() => {}, [1]);
    });
    expect(runner.ctx.pendingLayoutEffects).toHaveLength(1);

    runner.run(() => {
      useLayoutEffect(() => {}, [1]);
    });
    expect(runner.ctx.pendingLayoutEffects).toHaveLength(0);
  });
});

// ─── useMemo ──────────────────────────────────────────────────────────────────

describe("useMemo", () => {
  test("returns computed value", () => {
    const value = withHookCtx(() => useMemo(() => 3 * 2, []));
    expect(value).toBe(6);
  });

  test("recomputes when deps change", () => {
    const runner = createHookRunner();
    const v1 = runner.run(() => useMemo(() => 10, [1]));
    expect(v1).toBe(10);

    // Same deps — should return cached
    const v2 = runner.run(() => useMemo(() => 20, [1]));
    expect(v2).toBe(10);

    // Different deps — should recompute
    const v3 = runner.run(() => useMemo(() => 30, [2]));
    expect(v3).toBe(30);
  });
});

// ─── useCallback ──────────────────────────────────────────────────────────────

describe("useCallback", () => {
  test("returns the same function when deps unchanged", () => {
    const runner = createHookRunner();
    const fn1 = () => 42;
    const fn2 = () => 99;
    const result1 = runner.run(() => useCallback(fn1, [1]));
    const result2 = runner.run(() => useCallback(fn2, [1]));
    expect(result1).toBe(result2); // same deps → cached
    expect(result1()).toBe(42);
  });

  test("returns new function when deps change", () => {
    const runner = createHookRunner();
    const fn1 = () => 42;
    const fn2 = () => 99;
    const result1 = runner.run(() => useCallback(fn1, [1]));
    const result2 = runner.run(() => useCallback(fn2, [2]));
    expect(result2).toBe(fn2);
    expect(result2()).toBe(99);
    expect(result1).not.toBe(result2);
  });
});

// ─── useRef ───────────────────────────────────────────────────────────────────

describe("useRef", () => {
  test("returns { current } with null default", () => {
    const ref = withHookCtx(() => useRef<HTMLDivElement>());
    expect(ref.current).toBeNull();
  });

  test("returns { current } with initial value", () => {
    const ref = withHookCtx(() => useRef(42));
    expect(ref.current).toBe(42);
  });

  test("current is mutable", () => {
    const ref = withHookCtx(() => useRef(0));
    ref.current = 10;
    expect(ref.current).toBe(10);
  });

  test("same ref object persists across re-renders", () => {
    const runner = createHookRunner();
    const ref1 = runner.run(() => useRef(0));
    ref1.current = 99;
    const ref2 = runner.run(() => useRef(0));
    expect(ref1).toBe(ref2);
    expect(ref2.current).toBe(99);
  });
});

// ─── memo ─────────────────────────────────────────────────────────────────────

describe("memo", () => {
  test("skips re-render when props are shallowly equal", () => {
    let renderCount = 0;
    const MyComp = (props: { name: string }) => {
      renderCount++;
      return h("span", null, props.name);
    };
    const Memoized = memo(MyComp);
    Memoized({ name: "a" });
    expect(renderCount).toBe(1);
    Memoized({ name: "a" });
    expect(renderCount).toBe(1); // same props — skipped
    Memoized({ name: "b" });
    expect(renderCount).toBe(2); // different props — re-rendered
  });

  test("custom areEqual function", () => {
    let renderCount = 0;
    const MyComp = (props: { x: number; y: number }) => {
      renderCount++;
      return h("span", null, String(props.x));
    };
    // Only compare x, ignore y
    const Memoized = memo(MyComp, (prev, next) => prev.x === next.x);
    Memoized({ x: 1, y: 1 });
    expect(renderCount).toBe(1);
    Memoized({ x: 1, y: 999 });
    expect(renderCount).toBe(1); // y changed but x same → skipped
    Memoized({ x: 2, y: 999 });
    expect(renderCount).toBe(2); // x changed → re-rendered
  });

  test("different number of keys triggers re-render", () => {
    let renderCount = 0;
    const MyComp = (_props: Record<string, unknown>) => {
      renderCount++;
      return h("span", null, "x");
    };
    const Memoized = memo(MyComp);
    Memoized({ a: 1 });
    expect(renderCount).toBe(1);
    Memoized({ a: 1, b: 2 });
    expect(renderCount).toBe(2);
  });
});

// ─── useTransition ────────────────────────────────────────────────────────────

describe("useTransition", () => {
  test("returns [false, fn => fn()]", () => {
    const [isPending, startTransition] = useTransition();
    expect(isPending).toBe(false);
    let ran = false;
    startTransition(() => {
      ran = true;
    });
    expect(ran).toBe(true);
  });
});

// ─── useDeferredValue ─────────────────────────────────────────────────────────

describe("useDeferredValue", () => {
  test("returns value as-is", () => {
    expect(useDeferredValue(42)).toBe(42);
    expect(useDeferredValue("hello")).toBe("hello");
    const obj = { a: 1 };
    expect(useDeferredValue(obj)).toBe(obj);
  });
});

// ─── useId ────────────────────────────────────────────────────────────────────

describe("useId", () => {
  test("returns a unique string within a component", () => {
    const el = container();
    const ids: string[] = [];

    const Comp = () => {
      ids.push(useId());
      ids.push(useId());
      return h("div", null, "id-test");
    };

    mount(jsx(Comp, {}), el);
    // mountChild samples the accessor + effect runs it = 2 renders, 4 IDs pushed
    expect(ids.length).toBeGreaterThanOrEqual(2);
    // Within a single render, two useId calls produce different IDs
    expect(ids[0]).not.toBe(ids[1]);
    expect(typeof ids[0]).toBe("string");
    expect(ids[0]?.startsWith(":r")).toBe(true);
  });

  test("IDs are stable across re-renders", async () => {
    const el = container();
    const idHistory: string[] = [];
    let triggerSet: (v: number) => void = () => {};

    const Comp = () => {
      const [count, setCount] = useState(0);
      triggerSet = setCount;
      const id = useId();
      idHistory.push(id);
      return h("div", null, `${id}-${count}`);
    };

    mount(jsx(Comp, {}), el);
    const initialCount = idHistory.length; // mountChild samples + effect = 2 renders
    const firstId = idHistory[0];

    triggerSet(1);
    await new Promise<void>((r) => queueMicrotask(r));
    await new Promise<void>((r) => queueMicrotask(r));
    expect(idHistory.length).toBeGreaterThan(initialCount);
    // All IDs should be the same (stable across renders)
    for (const id of idHistory) {
      expect(id).toBe(firstId);
    }
  });
});

// ─── createPortal ─────────────────────────────────────────────────────────────

describe("createPortal", () => {
  test("creates a portal VNode that renders into target", () => {
    const src = container();
    const target = container();
    mount(createPortal(h("span", null, "portaled"), target), src);
    expect(target.querySelector("span")?.textContent).toBe("portaled");
    expect(src.querySelector("span")).toBeNull();
  });
});

// ─── lazy ─────────────────────────────────────────────────────────────────────

describe("lazy", () => {
  test("returns a component that loads async", async () => {
    const MyComp = (props: { text: string }) => h("p", null, props.text);
    const Lazy = lazy(() => Promise.resolve({ default: MyComp }));

    expect(Lazy({ text: "hello" })).toBeNull();

    await new Promise<void>((r) => setTimeout(r, 10));
    const result = Lazy({ text: "hello" });
    expect(result).not.toBeNull();
  });

  test("__loading reports loading state", async () => {
    const MyComp = () => h("div", null, "loaded");
    const Lazy = lazy(() => Promise.resolve({ default: MyComp }));
    expect(Lazy.__loading()).toBe(true);
    await new Promise<void>((r) => setTimeout(r, 10));
    expect(Lazy.__loading()).toBe(false);
  });
});

// ─── batch ────────────────────────────────────────────────────────────────────

describe("batch", () => {
  test("groups multiple signal updates into one flush", () => {
    const a = signal(0);
    const b = signal(0);
    let runs = 0;
    effect(() => {
      a();
      b();
      runs++;
    });
    expect(runs).toBe(1);
    batch(() => {
      a.set(1);
      b.set(1);
    });
    expect(runs).toBe(2);
  });
});

// ─── createRoot (dom.ts) ──────────────────────────────────────────────────────

describe("createRoot", () => {
  test("render mounts element into container", () => {
    const el = container();
    const root = createRoot(el);
    root.render(h("div", { id: "root-test" }, "hello"));
    expect(el.querySelector("#root-test")?.textContent).toBe("hello");
  });

  test("unmount removes content", () => {
    const el = container();
    const root = createRoot(el);
    root.render(h("p", null, "mounted"));
    expect(el.querySelector("p")).not.toBeNull();
    root.unmount();
    expect(el.innerHTML).toBe("");
  });

  test("re-render replaces previous content", () => {
    const el = container();
    const root = createRoot(el);
    root.render(h("span", null, "first"));
    expect(el.textContent).toBe("first");
    root.render(h("span", null, "second"));
    expect(el.textContent).toBe("second");
  });

  test("unmount after unmount is safe (no-op)", () => {
    const el = container();
    const root = createRoot(el);
    root.render(h("div", null, "x"));
    root.unmount();
    root.unmount();
    expect(el.innerHTML).toBe("");
  });
});

// ─── render (dom.ts) ──────────────────────────────────────────────────────────

describe("render", () => {
  test("mounts element into container", () => {
    const el = container();
    render(h("div", { id: "render-test" }, "world"), el);
    expect(el.querySelector("#render-test")?.textContent).toBe("world");
  });
});

// ─── useImperativeHandle ─────────────────────────────────────────────────────

describe("useImperativeHandle", () => {
  test("sets ref.current via layout effect", () => {
    const el = container();
    const ref = { current: null as { greet: () => string } | null };

    const Comp = () => {
      useImperativeHandle(ref, () => ({
        greet: () => "hello",
      }));
      return h("div", null, "imp");
    };

    mount(jsx(Comp, {}), el);
    expect(ref.current).not.toBeNull();
    expect(ref.current?.greet()).toBe("hello");
  });

  test("no-op when ref is null", () => {
    const el = container();

    const Comp = () => {
      useImperativeHandle(null, () => ({ value: 42 }));
      return h("div", null, "no-ref");
    };

    mount(jsx(Comp, {}), el);
  });

  test("no-op when ref is undefined", () => {
    const el = container();

    const Comp = () => {
      useImperativeHandle(undefined, () => ({ value: 42 }));
      return h("div", null, "undef-ref");
    };

    mount(jsx(Comp, {}), el);
  });
});

// ─── Re-exports ───────────────────────────────────────────────────────────────

describe("re-exports", () => {
  test("createElement is h", () => {
    expect(createElement).toBe(h);
  });

  test("Fragment is exported", () => {
    expect(typeof Fragment).toBe("symbol");
  });

  test("createContext creates context with default", () => {
    const Ctx = createContext("default");
    expect(useContext(Ctx)).toBe("default");
  });

  test("useContext reads from context", () => {
    const Ctx = createContext(42);
    expect(useContext(Ctx)).toBe(42);
  });

  test("Suspense is exported", () => {
    expect(typeof Suspense).toBe("function");
  });

  test("ErrorBoundary is exported", () => {
    expect(typeof ErrorBoundary).toBe("function");
  });

  test("useLayoutEffect is a function", () => {
    expect(typeof useLayoutEffect).toBe("function");
  });
});

// ─── jsx-runtime ──────────────────────────────────────────────────────────────

describe("jsx-runtime", () => {
  test("jsx with string type creates element VNode", () => {
    const vnode = jsx("div", { className: "test", children: "hello" });
    // className should be mapped to class
    expect(vnode.props.class).toBe("test");
    expect(vnode.props.className).toBeUndefined();
  });

  test("jsx with key prop", () => {
    const vnode = jsx("div", { children: "x" }, "my-key");
    expect(vnode.props.key).toBe("my-key");
  });

  test("jsx with component wraps for re-render", () => {
    const MyComp = () => h("span", null, "hi");
    const vnode = jsx(MyComp, {});
    // The component should be wrapped (different from original)
    expect(vnode.type).not.toBe(MyComp);
    expect(typeof vnode.type).toBe("function");
  });

  test("jsx with Fragment", () => {
    const vnode = jsx(Fragment, { children: [h("span", null, "a"), h("span", null, "b")] });
    expect(vnode.type).toBe(Fragment);
  });

  test("jsx with single child (not array)", () => {
    const vnode = jsx("div", { children: "text" });
    expect(vnode.children).toHaveLength(1);
  });

  test("jsx with no children", () => {
    const vnode = jsx("div", {});
    expect(vnode.children).toHaveLength(0);
  });

  test("jsx component with children in props", () => {
    const MyComp = (props: { children?: string }) => h("div", null, props.children ?? "");
    const vnode = jsx(MyComp, { children: "child-text" });
    expect(typeof vnode.type).toBe("function");
  });
});

// ─── Hook error when called outside component ────────────────────────────────

describe("hooks outside component", () => {
  test("useState throws when called outside render", () => {
    expect(() => useState(0)).toThrow("Hook called outside");
  });

  test("useEffect throws when called outside render", () => {
    expect(() => useEffect(() => {})).toThrow("Hook called outside");
  });

  test("useRef throws when called outside render", () => {
    expect(() => useRef(0)).toThrow("Hook called outside");
  });

  test("useMemo throws when called outside render", () => {
    expect(() => useMemo(() => 0, [])).toThrow("Hook called outside");
  });

  test("useId throws when called outside render", () => {
    expect(() => useId()).toThrow("Hook called outside");
  });

  test("useReducer throws when called outside render", () => {
    expect(() => useReducer((s: number) => s, 0)).toThrow("Hook called outside");
  });
});

// ─── Edge cases ──────────────────────────────────────────────────────────────

describe("edge cases", () => {
  test("useState with string initial", () => {
    const [val] = withHookCtx(() => useState("hello"));
    expect(val).toBe("hello");
  });

  test("useReducer with non-function initial", () => {
    const [state] = withHookCtx(() => useReducer((s: string, a: string) => s + a, "start"));
    expect(state).toBe("start");
  });

  test("depsChanged handles different length arrays", () => {
    const runner = createHookRunner();
    runner.run(() => {
      useEffect(() => {}, [1, 2]);
    });
    expect(runner.ctx.pendingEffects).toHaveLength(1);

    // Different length deps — should re-queue
    runner.run(() => {
      useEffect(() => {}, [1, 2, 3]);
    });
    expect(runner.ctx.pendingEffects).toHaveLength(1);
  });

  test("depsChanged with undefined deps always re-runs", () => {
    const runner = createHookRunner();
    runner.run(() => {
      useEffect(() => {});
    });
    expect(runner.ctx.pendingEffects).toHaveLength(1);

    // No deps — always re-queue
    runner.run(() => {
      useEffect(() => {});
    });
    expect(runner.ctx.pendingEffects).toHaveLength(1);
  });
});
