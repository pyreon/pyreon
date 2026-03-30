---
title: "@pyreon/react-compat"
description: React-compatible hook API that runs on Pyreon's fine-grained reactive engine.
---

`@pyreon/react-compat` lets you write familiar React-style code -- hooks, `createRoot`, `lazy`, `memo`, portals -- while running on Pyreon's signal-based reactive engine under the hood. It is designed as a migration path: swap your imports, keep your component code, and gain Pyreon's fine-grained reactivity, automatic dependency tracking, and single-execution component model.

<PackageBadge name="@pyreon/react-compat" href="/docs/react-compat" status="stable" />

## Installation

::: code-group

```bash [npm]
npm install @pyreon/react-compat
```

```bash [bun]
bun add @pyreon/react-compat
```

```bash [pnpm]
pnpm add @pyreon/react-compat
```

```bash [yarn]
yarn add @pyreon/react-compat
```

:::

## Quick Start

Replace your React imports:

```tsx
// Before
import { useState, useEffect, memo } from "react";
import { createRoot } from "react-dom/client";

// After
import { useState, useEffect, memo } from "@pyreon/react-compat";
import { createRoot } from "@pyreon/react-compat/dom";
```

Then use hooks exactly as you would in React:

```tsx
import { useState, useEffect, memo } from "@pyreon/react-compat";
import { createRoot } from "@pyreon/react-compat/dom";

const Counter = memo(() => {
  const [count, setCount] = useState(0);

  useEffect(() => {
    document.title = `Count: ${count()}`;
  });

  return (
    <div>
      <p>Count: {count()}</p>
      <button onClick={() => setCount((prev) => prev + 1)}>Increment</button>
    </div>
  );
});

createRoot(document.getElementById("app")!).render(<Counter />);
```

## Key Differences from React

Understanding these differences is essential for a smooth migration:

| Behavior               | React                                                | @pyreon/react-compat                                                  |
| ---------------------- | ---------------------------------------------------- | --------------------------------------------------------------------- |
| Component execution    | Re-runs on every render                              | Runs **once** (setup phase)                                           |
| `useState` getter      | Returns the value directly                           | Returns a **getter function** -- call `count()` to read               |
| `useEffect` deps       | Must specify deps array                              | Deps array is **ignored** -- Pyreon tracks dependencies automatically |
| `useCallback` / `memo` | Prevents re-creation on re-render                    | **No-op** -- components run once, so closures are never stale         |
| Hooks rules            | Must be called at top level, not in loops/conditions | **No restrictions** -- call anywhere, in loops, in conditions         |
| `useMemo`              | Returns the memoized value                           | Returns a **getter function** -- call `value()` to read               |
| `useLayoutEffect`      | Fires synchronously before paint                     | Same as `useEffect` -- Pyreon has no paint distinction                |
| Concurrent mode        | `useTransition`, `useDeferredValue` defer updates    | **No-ops** -- all updates are synchronous                             |

### Reading State

The most important difference: `useState` returns a **getter function**, not a raw value.

```tsx
// React
const [count, setCount] = useState(0);
console.log(count); // 0

// Pyreon
const [count, setCount] = useState(0);
console.log(count()); // 0 -- note the function call
```

This is what enables fine-grained reactivity: only the DOM nodes or effects that call `count()` will update when the value changes. The component function itself never re-runs.

### Dependency Arrays Are Ignored

Pyreon tracks reactive dependencies automatically. You never need to list deps:

```tsx
const [name, setName] = useState("world");

// React: must list [name] or the effect is stale
// Pyreon: deps are ignored -- name() is auto-tracked
useEffect(() => {
  document.title = `Hello, ${name()}`;
});
```

The one exception is `useEffect(() => &#123;...&#125;, [])` with an **empty** array, which is treated as "run once on mount" -- the callback runs inside `runUntracked` so no signals are tracked.

### No Hooks Rules

In React, hooks must be called at the top level of the component, never inside conditionals or loops. In Pyreon, there are no such restrictions because the component runs once:

```tsx
function ConditionalHooks(props: { showExtra: boolean }) {
  const [name, setName] = useState("Alice");

  // This is perfectly fine in Pyreon -- forbidden in React
  if (props.showExtra) {
    const [extra, setExtra] = useState("bonus");
    useEffect(() => {
      console.log("Extra:", extra());
    });
  }

  return <div>{name()}</div>;
}
```

### No Stale Closures

In React, closures capture the value at render time and can become stale. In Pyreon, the component runs once and signals always return the current value:

```tsx
function Timer() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      // In React, this would always log 0 without deps
      // In Pyreon, count() always returns the current value
      console.log("Count is:", count());
      setCount((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(id);
  }, []); // empty deps -- mount-only

  return <div>{count()}</div>;
}
```

## API Reference

### State

#### `useState`

```ts
function useState<T>(initial: T | (() => T)): [() => T, (v: T | ((prev: T) => T)) => void];
```

Creates a reactive signal. Returns a `[getter, setter]` tuple. The getter is a function that tracks reads automatically. The setter accepts a value or an updater function.

```tsx
const [count, setCount] = useState(0);

setCount(5); // set directly
setCount((prev) => prev + 1); // updater function

// Lazy initializer (runs once during setup)
const [data, setData] = useState(() => expensiveComputation());
```

**Gotcha: Passing state to child components.**

Because the getter is a function, you must either pass it as-is or call it in a reactive context:

```tsx
// Pass the getter directly -- child reads it reactively
<ChildComponent count={count} />
// In child: props.count() to read

// Or wrap in a reactive expression
<span>{count()}</span>
```

#### `useReducer`

```ts
function useReducer<S, A>(
  reducer: (state: S, action: A) => S,
  initial: S | (() => S),
): [() => S, (action: A) => void];
```

Works like React's `useReducer`. Returns `[getter, dispatch]`.

```tsx
type Action = { type: "inc" } | { type: "dec" } | { type: "reset"; value: number };

const reducer = (state: number, action: Action): number => {
  switch (action.type) {
    case "inc":
      return state + 1;
    case "dec":
      return state - 1;
    case "reset":
      return action.value;
  }
};

const [count, dispatch] = useReducer(reducer, 0);

dispatch({ type: "inc" }); // count() === 1
dispatch({ type: "inc" }); // count() === 2
dispatch({ type: "reset", value: 0 }); // count() === 0
```

**Real-world reducer example -- form state machine:**

```tsx
interface FormState {
  status: "idle" | "submitting" | "success" | "error";
  data: Record<string, string>;
  error: string | null;
}

type FormAction =
  | { type: "field"; name: string; value: string }
  | { type: "submit" }
  | { type: "success" }
  | { type: "error"; message: string }
  | { type: "reset" };

const formReducer = (state: FormState, action: FormAction): FormState => {
  switch (action.type) {
    case "field":
      return { ...state, data: { ...state.data, [action.name]: action.value } };
    case "submit":
      return { ...state, status: "submitting", error: null };
    case "success":
      return { ...state, status: "success" };
    case "error":
      return { ...state, status: "error", error: action.message };
    case "reset":
      return { status: "idle", data: {}, error: null };
  }
};

function ContactForm() {
  const [state, dispatch] = useReducer(formReducer, {
    status: "idle",
    data: {},
    error: null,
  });

  const handleSubmit = async (e: SubmitEvent) => {
    e.preventDefault();
    dispatch({ type: "submit" });
    try {
      await fetch("/api/contact", {
        method: "POST",
        body: JSON.stringify(state().data),
      });
      dispatch({ type: "success" });
    } catch (err) {
      dispatch({ type: "error", message: String(err) });
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <input
        value={() => state().data.name ?? ""}
        onInput={(e) =>
          dispatch({
            type: "field",
            name: "name",
            value: (e.target as HTMLInputElement).value,
          })
        }
      />
      <button type="submit" disabled={() => state().status === "submitting"}>
        {() => (state().status === "submitting" ? "Sending..." : "Send")}
      </button>
      {() => state().error && <p class="error">{state().error}</p>}
    </form>
  );
}
```

### Effects

#### `useEffect`

```ts
function useEffect(fn: () => CleanupFn | void, deps?: unknown[]): void;
```

Runs a reactive side effect. The `deps` array is **ignored** -- Pyreon auto-tracks all signal reads inside `fn`. Return a cleanup function to dispose resources when the effect re-runs or the component unmounts.

```tsx
useEffect(() => {
  const controller = new AbortController();
  fetch(`/api/user/${id()}`, { signal: controller.signal })
    .then((res) => res.json())
    .then(setUser);
  return () => controller.abort();
});
```

**Mount-only effects:** Pass an empty deps array `[]` to run exactly once on mount. The callback is wrapped in `runUntracked`, so signal reads inside it will not establish tracking.

```tsx
useEffect(() => {
  console.log("Component mounted");
  const ws = new WebSocket("wss://api.example.com/stream");
  return () => ws.close();
}, []);
```

**Real-world effect patterns:**

```tsx
// DOM measurement
function AutoSizeTextarea() {
  const [text, setText] = useState("");
  const ref = useRef<HTMLTextAreaElement>();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  });

  return (
    <textarea
      ref={ref}
      value={() => text()}
      onInput={(e) => setText((e.target as HTMLTextAreaElement).value)}
    />
  );
}

// Intersection observer
function LazyImage(props: { src: string }) {
  const [visible, setVisible] = useState(false);
  const ref = useRef<HTMLDivElement>();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setVisible(true);
        observer.disconnect();
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref}>{() => (visible() ? <img src={props.src} /> : <div class="placeholder" />)}</div>
  );
}

// Document event listener
function useDocumentTitle(title: () => string) {
  useEffect(() => {
    document.title = title();
  });
}

// Media query
function useMediaQuery(query: string): () => boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia(query);
    setMatches(mql.matches);
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);

  return matches;
}
```

#### `useLayoutEffect`

Alias for `useEffect`. Pyreon does not distinguish between layout and passive effects. In React, `useLayoutEffect` fires synchronously before browser paint; in Pyreon, all effects run synchronously.

### Memoization

#### `useMemo`

```ts
function useMemo<T>(fn: () => T, _deps?: unknown[]): () => T;
```

Creates a computed (memoized) value backed by Pyreon's `computed()`. Returns a **getter function**. The deps array is ignored -- Pyreon auto-tracks dependencies.

```tsx
const [items, setItems] = useState([1, 2, 3]);
const total = useMemo(() => items().reduce((a, b) => a + b, 0));

console.log(total()); // 6
```

**Real-world memoization:**

```tsx
function ProductList() {
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"name" | "price">("name");

  // Each computed only recalculates when its specific dependencies change
  const filtered = useMemo(() => {
    const q = search().toLowerCase();
    return q ? products().filter((p) => p.name.toLowerCase().includes(q)) : products();
  });

  const sorted = useMemo(() => {
    const key = sortBy();
    return [...filtered()].sort((a, b) => (a[key] < b[key] ? -1 : a[key] > b[key] ? 1 : 0));
  });

  const totalPrice = useMemo(() => sorted().reduce((sum, p) => sum + p.price, 0));

  return (
    <div>
      <input
        placeholder="Search..."
        onInput={(e) => setSearch((e.target as HTMLInputElement).value)}
      />
      <p>Total: ${() => totalPrice().toFixed(2)}</p>
      <ul>
        {() =>
          sorted().map((p) => (
            <li>
              {p.name} - ${p.price}
            </li>
          ))
        }
      </ul>
    </div>
  );
}
```

#### `useCallback`

```ts
function useCallback<T extends (...args: unknown[]) => unknown>(fn: T, _deps?: unknown[]): T;
```

Returns `fn` as-is. Components run once in Pyreon, so there are no stale closure issues and no need to memoize callbacks.

```tsx
// React: useCallback prevents unnecessary child re-renders
// Pyreon: returns fn as-is -- no re-renders to prevent
const handleClick = useCallback((id: number) => {
  setSelected(id);
}, []);
```

#### `memo`

```ts
function memo<P>(component: (props: P) => VNodeChild): (props: P) => VNodeChild;
```

Returns the component as-is (no-op). Pyreon components already run once, so wrapping in `memo` has no effect. Kept for API compatibility so you do not need to strip `memo` wrappers during migration.

```tsx
// These are identical in Pyreon
const MyComponent = memo((props: { name: string }) => <div>{props.name}</div>);
const MyComponent = (props: { name: string }) => <div>{props.name}</div>;
```

### Refs

#### `useRef`

```ts
function useRef<T>(initial?: T): { current: T | null };
```

Returns a mutable `&#123; current &#125;` object, identical in shape to React's ref.

```tsx
const inputRef = useRef<HTMLInputElement>()

// Attach to an element
<input ref={inputRef} />

// Read later
inputRef.current?.focus()
```

**Storing mutable values (non-DOM):**

```tsx
function Stopwatch() {
  const [elapsed, setElapsed] = useState(0);
  const intervalRef = useRef<number>();

  const start = () => {
    intervalRef.current = window.setInterval(() => {
      setElapsed((prev) => prev + 1);
    }, 1000);
  };

  const stop = () => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current!);
      intervalRef.current = null;
    }
  };

  return (
    <div>
      <p>{elapsed()}s</p>
      <button onClick={start}>Start</button>
      <button onClick={stop}>Stop</button>
    </div>
  );
}
```

#### `useImperativeHandle`

```ts
function useImperativeHandle<T>(
  ref: { current: T | null } | null | undefined,
  init: () => T,
  _deps?: unknown[],
): void;
```

Populates `ref.current` with the value returned by `init` on mount. Resets to `null` on unmount. Safe to pass `null` or `undefined` as the ref.

```tsx
interface FancyInputAPI {
  focus: () => void;
  reset: () => void;
  getValue: () => string;
}

function FancyInput(props: { ref?: { current: FancyInputAPI | null } }) {
  const inputRef = useRef<HTMLInputElement>();
  const [value, setValue] = useState("");

  useImperativeHandle(props.ref, () => ({
    focus: () => inputRef.current?.focus(),
    reset: () => {
      setValue("");
      inputRef.current?.focus();
    },
    getValue: () => value(),
  }));

  return (
    <input
      ref={inputRef}
      value={() => value()}
      onInput={(e) => setValue((e.target as HTMLInputElement).value)}
    />
  );
}

// Parent component
function Form() {
  const fancyRef = useRef<FancyInputAPI>();

  return (
    <div>
      <FancyInput ref={fancyRef} />
      <button onClick={() => fancyRef.current?.focus()}>Focus</button>
      <button onClick={() => fancyRef.current?.reset()}>Reset</button>
    </div>
  );
}
```

### Context

#### `createContext` / `useContext`

```ts
function createContext<T>(defaultValue: T): Context<T>;
function useContext<T>(ctx: Context<T>): T;
```

Direct re-exports from `@pyreon/core`. Usage is identical to React:

```tsx
const ThemeCtx = createContext("light");

function App() {
  const theme = useContext(ThemeCtx);
  return <div class={theme}>...</div>;
}
```

**Real-world context example -- toast notifications:**

```tsx
interface Toast {
  id: string;
  message: string;
  type: "info" | "success" | "error";
}

interface ToastAPI {
  toasts: () => Toast[];
  add: (message: string, type?: Toast["type"]) => void;
  remove: (id: string) => void;
}

const ToastContext = createContext<ToastAPI>({
  toasts: () => [],
  add: () => {},
  remove: () => {},
});

function ToastProvider(props: { children: VNodeChild }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const api: ToastAPI = {
    toasts,
    add(message, type = "info") {
      const id = Math.random().toString(36).slice(2);
      setToasts((prev) => [...prev, { id, message, type }]);
      setTimeout(() => api.remove(id), 5000);
    },
    remove(id) {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    },
  };

  // Provide via withContext (from @pyreon/core)
  return withContext(ToastContext, api, () => (
    <>
      {props.children}
      <div class="toast-container">
        {() =>
          toasts().map((toast) => (
            <div class={`toast toast-${toast.type}`}>
              {toast.message}
              <button onClick={() => api.remove(toast.id)}>&times;</button>
            </div>
          ))
        }
      </div>
    </>
  ));
}

// Consuming component
function SaveButton() {
  const toast = useContext(ToastContext);

  const handleSave = async () => {
    try {
      await saveData();
      toast.add("Saved successfully!", "success");
    } catch {
      toast.add("Failed to save", "error");
    }
  };

  return <button onClick={handleSave}>Save</button>;
}
```

### Unique IDs

#### `useId`

```ts
function useId(): string;
```

Returns a stable, deterministic unique string (e.g. `:r0:`, `:r1:`) scoped to the current component instance. Safe for SSR hydration -- IDs are based on the component's effect scope, not a global counter.

```tsx
function FormField(props: { label: string; children: VNodeChild }) {
  const id = useId();
  return (
    <div class="form-field">
      <label for={id}>{props.label}</label>
      <div id={id}>{props.children}</div>
    </div>
  );
}
```

**Accessible form with useId:**

```tsx
function AccessibleCombobox() {
  const id = useId();
  const listboxId = `${id}-listbox`;
  const inputId = `${id}-input`;
  const [open, setOpen] = useState(false);

  return (
    <div role="combobox" aria-expanded={() => open()} aria-owns={listboxId}>
      <input
        id={inputId}
        aria-autocomplete="list"
        aria-controls={listboxId}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
      />
      {() =>
        open() && (
          <ul id={listboxId} role="listbox" aria-labelledby={inputId}>
            <li role="option">Option 1</li>
            <li role="option">Option 2</li>
          </ul>
        )
      }
    </div>
  );
}
```

### Concurrent Mode Shims

#### `useTransition`

```ts
function useTransition(): [boolean, (fn: () => void) => void];
```

Returns `[false, fn => fn()]`. Pyreon has no concurrent mode, so transitions execute immediately. Kept so migrated code does not break.

```tsx
// Works but has no deferred behavior
const [isPending, startTransition] = useTransition();

startTransition(() => {
  setSearchResults(computeResults(query));
});
// isPending is always false
```

#### `useDeferredValue`

```ts
function useDeferredValue<T>(value: T): T;
```

Returns the value as-is. No deferral in Pyreon.

### Portals

#### `createPortal`

```ts
function createPortal(children: VNodeChild, target: Element): VNodeChild;
```

Renders `children` into a different DOM `target`, just like React's `createPortal`.

```tsx
function Modal(props: { open: () => boolean; children: VNodeChild }) {
  return () =>
    props.open()
      ? createPortal(
          <div class="modal-overlay">
            <div class="modal">{props.children}</div>
          </div>,
          document.getElementById("modal-root")!,
        )
      : null;
}
```

**Dropdown positioned outside the flow:**

```tsx
function Dropdown(props: { trigger: VNodeChild; children: VNodeChild }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLDivElement>();

  return (
    <div ref={triggerRef} onClick={() => setOpen((prev) => !prev)}>
      {props.trigger}
      {() =>
        open() &&
        createPortal(
          <div
            class="dropdown-menu"
            style={() => {
              const rect = triggerRef.current?.getBoundingClientRect();
              return rect ? `position:fixed;top:${rect.bottom}px;left:${rect.left}px` : "";
            }}
          >
            {props.children}
          </div>,
          document.body,
        )
      }
    </div>
  );
}
```

### Suspense and Lazy Loading

#### `lazy`

```ts
function lazy<P>(load: () => Promise<{ default: ComponentFn<P> }>): LazyComponent<P>;
```

Wraps a dynamic import. The returned component renders `null` until the module resolves. Pair with `<Suspense>` to show a fallback.

```tsx
const Dashboard = lazy(() => import("./Dashboard"));
const Settings = lazy(() => import("./Settings"));
const Profile = lazy(() => import("./Profile"));

function App() {
  const [page, setPage] = useState("dashboard");

  return (
    <div>
      <nav>
        <button onClick={() => setPage("dashboard")}>Dashboard</button>
        <button onClick={() => setPage("settings")}>Settings</button>
        <button onClick={() => setPage("profile")}>Profile</button>
      </nav>
      <Suspense fallback={<div class="loading-skeleton" />}>
        {() => {
          switch (page()) {
            case "dashboard":
              return <Dashboard />;
            case "settings":
              return <Settings />;
            case "profile":
              return <Profile />;
            default:
              return <div>Not found</div>;
          }
        }}
      </Suspense>
    </div>
  );
}
```

#### `Suspense` / `ErrorBoundary`

Re-exported from `@pyreon/core`. `<Suspense>` shows a fallback while lazy children load. `<ErrorBoundary>` catches errors in its subtree.

```tsx
function App() {
  return (
    <ErrorBoundary
      fallback={(err, reset) => (
        <div>
          <p>Error: {String(err)}</p>
          <button onClick={reset}>Retry</button>
        </div>
      )}
    >
      <Suspense fallback={<LoadingSkeleton />}>
        <Dashboard />
      </Suspense>
    </ErrorBoundary>
  );
}
```

### Batching

#### `batch`

```ts
function batch<T>(fn: () => T): T;
```

Groups multiple signal updates into a single flush. React 18 batches updates automatically inside event handlers; Pyreon does the same, but `batch` gives you explicit control for updates outside of event handlers.

```tsx
batch(() => {
  setName("Alice");
  setAge(30);
  setRole("admin");
});
// Only one re-computation, not three
```

**Batch with async boundaries:**

```tsx
async function fetchAndUpdate() {
  const [user, posts] = await Promise.all([fetchUser(), fetchPosts()]);

  // Multiple updates from async result -- batch them
  batch(() => {
    setUser(user);
    setPosts(posts);
    setLoading(false);
  });
}
```

### Additional Exports

#### `createSelector`

```ts
function createSelector<T>(source: () => T): (key: T) => boolean;
```

An O(1) equality selector from `@pyreon/reactivity`. Useful for large lists where only the selected item should react to selection changes. No direct React equivalent.

```tsx
function SelectableList(props: { items: Item[] }) {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const isSelected = createSelector(selectedId);

  return (
    <ul>
      {props.items.map((item) => (
        <li
          class={() => (isSelected(item.id) ? "selected" : "")}
          onClick={() => setSelectedId(item.id)}
        >
          {item.name}
        </li>
      ))}
    </ul>
  );
}
```

#### Lifecycle Hooks

`onMount`, `onUnmount`, and `onUpdate` are re-exported from `@pyreon/core` for cases where you want Pyreon-native lifecycle hooks alongside the React-compatible API.

```tsx
import { onMount, onUnmount, onUpdate } from "@pyreon/react-compat";

function MyComponent() {
  onMount(() => {
    console.log("Mounted");
    return () => console.log("Cleanup from onMount");
  });

  onUnmount(() => {
    console.log("Unmounted");
  });

  onUpdate(() => {
    console.log("A reactive update occurred");
  });

  return <div>Hello</div>;
}
```

#### `useErrorBoundary`

Re-export of `onErrorCaptured` from `@pyreon/core`. Register a handler for errors thrown in child components.

```tsx
import { useErrorBoundary } from "@pyreon/react-compat";

function SafeWrapper(props: { children: VNodeChild }) {
  const [error, setError] = useState<string | null>(null);

  useErrorBoundary((err) => {
    setError(String(err));
    return true; // handled
  });

  return () => (error() ? <div class="error">{error()}</div> : props.children);
}
```

## DOM Entry Point

### `@pyreon/react-compat/dom`

Provides `createRoot` and `render` for mounting your app, matching the `react-dom/client` API.

#### `createRoot`

```ts
function createRoot(container: Element): { render(element: VNodeChild): void; unmount(): void };
```

```tsx
import { createRoot } from "@pyreon/react-compat/dom";

const root = createRoot(document.getElementById("app")!);
root.render(<App />);

// Later -- replace content
root.render(<NewApp />);

// Later -- clean up
root.unmount();
```

Calling `render` again replaces the previous content (previous mount is cleaned up first). Calling `unmount` multiple times is safe.

#### `render`

```ts
function render(element: VNodeChild, container: Element): void;
```

Legacy API matching React 17's `ReactDOM.render`. Mounts `element` into `container`.

```tsx
import { render } from "@pyreon/react-compat/dom";

render(<App />, document.getElementById("app")!);
```

## Common Migration Patterns

### Converting useState Reads

The most common change is adding `()` to state reads:

```tsx
// Before (React)
const [count, setCount] = useState(0);
return <div>{count}</div>;

// After (Pyreon)
const [count, setCount] = useState(0);
return <div>{count()}</div>;
```

Search for `useState` in your codebase and ensure every read of the state variable includes `()`.

### Converting useEffect

Remove dependency arrays (or leave them -- they are ignored):

```tsx
// Before (React)
useEffect(() => {
  document.title = `Count: ${count}`;
}, [count]);

// After (Pyreon) -- deps removed, count read as function
useEffect(() => {
  document.title = `Count: ${count()}`;
});
```

### Converting useMemo

Add `()` to read the memoized value:

```tsx
// Before (React)
const total = useMemo(() => items.reduce((a, b) => a + b, 0), [items]);
return <p>Total: {total}</p>;

// After (Pyreon) -- total is a getter, deps removed
const total = useMemo(() => items().reduce((a, b) => a + b, 0));
return <p>Total: {total()}</p>;
```

### Removing Unnecessary Wrappers

```tsx
// Before (React) -- memo and useCallback are needed
const MemoChild = memo(({ onClick }: { onClick: () => void }) => (
  <button onClick={onClick}>Click</button>
));
const Parent = () => {
  const handleClick = useCallback(() => console.log("clicked"), []);
  return <MemoChild onClick={handleClick} />;
};

// After (Pyreon) -- memo and useCallback are no-ops, can be removed
const Child = ({ onClick }: { onClick: () => void }) => <button onClick={onClick}>Click</button>;
const Parent = () => {
  const handleClick = () => console.log("clicked");
  return <Child onClick={handleClick} />;
};
```

### Moving Render-Phase Logic to Effects

If your React component had logic that ran on every render (outside of hooks), move it into an effect:

```tsx
// Before (React) -- runs on every render
function Component({ data }) {
  const processed = data.map(transform);
  console.log("Processed:", processed);
  return <List items={processed} />;
}

// After (Pyreon) -- component runs once, use computed + effect
function Component(props: { data: () => Item[] }) {
  const processed = useMemo(() => props.data().map(transform));

  useEffect(() => {
    console.log("Processed:", processed());
  });

  return <List items={processed} />;
}
```

## Migration Gotchas

### Third-Party React Libraries

Libraries that depend on React internals (reconciler, fiber, etc.) will not work with `@pyreon/react-compat`. Libraries that only use the public hook API (`useState`, `useEffect`, etc.) may work with alias configuration:

```ts
// vite.config.ts
export default defineConfig({
  resolve: {
    alias: {
      react: "@pyreon/react-compat",
      "react-dom": "@pyreon/react-compat/dom",
      "react-dom/client": "@pyreon/react-compat/dom",
    },
  },
});
```

### forwardRef

React's `forwardRef` is not needed in Pyreon. Pass refs as regular props:

```tsx
// React
const FancyInput = forwardRef<HTMLInputElement, Props>((props, ref) => (
  <input ref={ref} {...props} />
));

// Pyreon -- just pass ref as a prop
const FancyInput = (props: Props & { ref?: Ref<HTMLInputElement> }) => (
  <input ref={props.ref} {...props} />
);
```

### React.Children

`React.Children` utilities are not available. Use standard array methods on `props.children` instead.

### Strict Mode

React's `<StrictMode>` has no equivalent (and no need) in Pyreon. Components run once, so double-invocation checks are not applicable.

## Migration Checklist

1. Replace `react` / `react-dom` imports with `@pyreon/react-compat` / `@pyreon/react-compat/dom`.
2. Change state reads from `count` to `count()` and memo reads from `value` to `value()`.
3. Remove dependency arrays from `useEffect` and `useMemo` (or leave them -- they are ignored).
4. Remove `useCallback` wrappers and `memo` wrappers (or leave them -- they are no-ops).
5. Verify any code that relies on re-render behavior. Pyreon components run once; logic that depends on running on every render must be moved into an `effect` or `useEffect`.
6. Check third-party library compatibility. Libraries using React internals will need alternatives.
7. Remove `forwardRef` usage and pass refs as regular props.
8. Remove `StrictMode` wrappers.
9. Test `useEffect` with empty deps `[]` -- ensure the mount-only behavior matches your intent.
10. Verify event handler closures work correctly -- they always read current signal values, unlike React where they capture values at render time.
