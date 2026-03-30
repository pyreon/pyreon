---
title: "@pyreon/solid-compat"
description: SolidJS-compatible reactive API that runs on Pyreon's reactive engine.
---

`@pyreon/solid-compat` provides a SolidJS-compatible API -- `createSignal`, `createEffect`, `createMemo`, control flow components, and more -- all running on Pyreon's reactive engine. Since Pyreon and Solid share the same mental model (fine-grained reactivity, components run once, getter/setter signals), this compatibility layer is particularly thin.

<PackageBadge name="@pyreon/solid-compat" href="/docs/solid-compat" status="stable" />

## Installation

::: code-group

```bash [npm]
npm install @pyreon/solid-compat
```

```bash [bun]
bun add @pyreon/solid-compat
```

```bash [pnpm]
pnpm add @pyreon/solid-compat
```

```bash [yarn]
yarn add @pyreon/solid-compat
```

:::

## Quick Start

Replace your Solid imports:

```tsx
// Before
import { createSignal, createEffect, createMemo, Show, For } from "solid-js";

// After
import { createSignal, createEffect, createMemo, Show, For } from "@pyreon/solid-compat";
```

```tsx
import { createSignal, createEffect, Show } from "@pyreon/solid-compat";

const Counter = () => {
  const [count, setCount] = createSignal(0);

  createEffect(() => {
    document.title = `Count: ${count()}`;
  });

  return (
    <div>
      <p>Count: {count()}</p>
      <button onClick={() => setCount((prev) => prev + 1)}>+1</button>
      <Show when={() => count() > 5}>
        <p>High count!</p>
      </Show>
    </div>
  );
};
```

## Key Differences from SolidJS

Since Pyreon and Solid share the same reactive paradigm, the API is nearly identical. The main differences are internal:

| Behavior                    | SolidJS                                  | @pyreon/solid-compat                                          |
| --------------------------- | ---------------------------------------- | ------------------------------------------------------------- |
| Reactive engine             | Solid's own signal implementation        | Pyreon's `@pyreon/reactivity`                                 |
| `createComputed`            | Deprecated legacy API                    | Alias for `createEffect`                                      |
| `createRenderEffect`        | Runs before DOM paint                    | Same as `createEffect` -- no paint distinction in Pyreon      |
| `on()`                      | Explicit dependency helper               | Supported -- returns a function for use inside `createEffect` |
| `mergeProps` / `splitProps` | Preserves reactive getters               | Same behavior -- preserves property descriptors               |
| Control flow                | `<Show>`, `<For>`, `<Switch>`, `<Match>` | Re-exported from `@pyreon/core` -- same API                   |
| `createStore` / `produce`   | From `solid-js/store`                    | Use `@pyreon/reactivity`'s `createStore` and `reconcile`      |
| Transitions                 | `useTransition`, `startTransition`       | Not available -- updates are synchronous                      |
| `createResource`            | Built-in async primitive                 | Use `@pyreon/reactivity`'s `createResource`                   |

### Why This Layer Is Thin

Solid and Pyreon share the same fundamental design:

1. **Components run once** -- the function body is setup, not a render function
2. **Signals are getter/setter pairs** -- `const [value, setValue] = createSignal(0)`
3. **Effects auto-track dependencies** -- no deps arrays needed
4. **Control flow is component-based** -- `<Show>`, `<For>`, `<Switch>`, `<Match>`

This means most Solid code works with Pyreon after a simple import swap. The compatibility layer is primarily mapping Solid's API names to Pyreon's underlying primitives.

## API Reference

### Signals

#### `createSignal`

```ts
function createSignal<T>(initialValue: T): [SignalGetter<T>, SignalSetter<T>];

type SignalGetter<T> = () => T;
type SignalSetter<T> = (v: T | ((prev: T) => T)) => void;
```

Creates a reactive signal. Returns a `[getter, setter]` tuple -- the same pattern as SolidJS.

```tsx
const [count, setCount] = createSignal(0);

count(); // read (tracked)
setCount(5); // set directly
setCount((prev) => prev + 1); // updater function
```

**Common signal patterns:**

```tsx
// Boolean toggle
const [open, setOpen] = createSignal(false);
const toggle = () => setOpen((prev) => !prev);

// Array state
const [items, setItems] = createSignal<string[]>([]);
const addItem = (item: string) => setItems((prev) => [...prev, item]);
const removeItem = (index: number) => setItems((prev) => prev.filter((_, i) => i !== index));

// Object state
const [user, setUser] = createSignal<User | null>(null);
const updateName = (name: string) => setUser((prev) => (prev ? { ...prev, name } : null));

// Derived state via createMemo
const [firstName, setFirstName] = createSignal("Alice");
const [lastName, setLastName] = createSignal("Smith");
const fullName = createMemo(() => `${firstName()} ${lastName()}`);
```

**Signal as a reactive data source for components:**

```tsx
// Parent passes a signal getter to child -- child reads it reactively
function Parent() {
  const [count, setCount] = createSignal(0);
  return (
    <div>
      <Display count={count} />
      <button onClick={() => setCount((prev) => prev + 1)}>+1</button>
    </div>
  );
}

function Display(props: { count: () => number }) {
  return <span>Count: {props.count()}</span>;
}
```

### Effects

#### `createEffect`

```ts
function createEffect(fn: () => void): void;
```

Runs `fn` immediately and re-runs it whenever any signal read inside `fn` changes. Backed by Pyreon's `effect()`.

```tsx
createEffect(() => {
  console.log("Count changed to", count());
});
```

**Effect with DOM manipulation:**

```tsx
function AutoScroll(props: { messages: () => Message[] }) {
  let containerRef: HTMLDivElement | undefined;

  createEffect(() => {
    // Read messages to track changes
    const msgs = props.messages();
    // Scroll to bottom after new messages
    if (containerRef) {
      containerRef.scrollTop = containerRef.scrollHeight;
    }
  });

  return (
    <div ref={containerRef} class="messages">
      {() => props.messages().map((m) => <p>{m.text}</p>)}
    </div>
  );
}
```

**Effect with cleanup pattern:**

```tsx
function WebSocketComponent(props: { url: () => string }) {
  const [messages, setMessages] = createSignal<string[]>([]);

  createEffect(() => {
    const wsUrl = props.url();
    const ws = new WebSocket(wsUrl);

    ws.onmessage = (e) => {
      setMessages((prev) => [...prev, e.data]);
    };

    // In Solid, onCleanup is used inside createEffect
    // In Pyreon, use onCleanup (which maps to onUnmount)
    onCleanup(() => ws.close());
  });

  return <ul>{() => messages().map((m) => <li>{m}</li>)}</ul>;
}
```

#### `createRenderEffect`

```ts
function createRenderEffect(fn: () => void): void;
```

Identical to `createEffect` in Pyreon. Solid distinguishes render effects (run before DOM paint) from regular effects (run after); Pyreon does not make this distinction.

```tsx
// In Solid, createRenderEffect runs synchronously before paint
// In Pyreon, behaves identically to createEffect
createRenderEffect(() => {
  document.title = `${count()} items`;
});
```

#### `createComputed`

Alias for `createEffect`. This is Solid's deprecated legacy API, kept for compatibility with older Solid codebases.

### Derived Values

#### `createMemo`

```ts
function createMemo<T>(fn: () => T): () => T;
```

Creates a computed derived value. Returns a getter function. The computation is lazy and cached -- it only re-evaluates when its tracked dependencies change.

```tsx
const [count, setCount] = createSignal(3);
const doubled = createMemo(() => count() * 2);

doubled(); // 6
setCount(10);
doubled(); // 20
```

**Complex derived state:**

```tsx
const [todos, setTodos] = createSignal<Todo[]>([]);
const [filter, setFilter] = createSignal<"all" | "active" | "done">("all");

const filteredTodos = createMemo(() => {
  const list = todos();
  switch (filter()) {
    case "active":
      return list.filter((t) => !t.done);
    case "done":
      return list.filter((t) => t.done);
    default:
      return list;
  }
});

const stats = createMemo(() => ({
  total: todos().length,
  active: todos().filter((t) => !t.done).length,
  done: todos().filter((t) => t.done).length,
}));
```

**Chained memos:**

```tsx
const [products, setProducts] = createSignal<Product[]>([]);
const [search, setSearch] = createSignal("");
const [sort, setSort] = createSignal<"name" | "price">("name");
const [page, setPage] = createSignal(0);

// Each memo only recalculates when its direct deps change
const searched = createMemo(() => {
  const q = search().toLowerCase();
  return q ? products().filter((p) => p.name.toLowerCase().includes(q)) : products();
});

const sorted = createMemo(() => {
  const key = sort();
  return [...searched()].sort((a, b) => (a[key] < b[key] ? -1 : a[key] > b[key] ? 1 : 0));
});

const paginated = createMemo(() => {
  const start = page() * 20;
  return sorted().slice(start, start + 20);
});

const totalPages = createMemo(() => Math.ceil(sorted().length / 20));
```

### Ownership and Scoping

#### `createRoot`

```ts
function createRoot<T>(fn: (dispose: () => void) => T): T;
```

Creates a new reactive scope. The `dispose` callback stops all effects and computations created within the scope. Essential for top-level reactive code outside of components.

```tsx
createRoot((dispose) => {
  const [count, setCount] = createSignal(0);
  createEffect(() => console.log(count()));

  // Later: stop all tracking
  setTimeout(dispose, 5000);
});
```

**Top-level reactive store:**

```tsx
// Global reactive state -- must be wrapped in createRoot
const appState = createRoot((dispose) => {
  const [user, setUser] = createSignal<User | null>(null);
  const [theme, setTheme] = createSignal<"light" | "dark">("light");

  const isLoggedIn = createMemo(() => user() !== null);

  return {
    user,
    setUser,
    theme,
    setTheme,
    isLoggedIn,
    dispose, // for cleanup
  };
});

// Use in components
function Header() {
  return (
    <header class={() => appState.theme()}>
      <Show when={appState.isLoggedIn} fallback={<LoginButton />}>
        <UserMenu user={appState.user} />
      </Show>
    </header>
  );
}
```

#### `getOwner` / `runWithOwner`

```ts
function getOwner(): EffectScope | null;
function runWithOwner<T>(owner: EffectScope | null, fn: () => T): T;
```

Capture the current reactive scope and run code within it later. Useful for effects created asynchronously (e.g., after an `await`).

```tsx
const owner = getOwner();

setTimeout(() => {
  // Without runWithOwner, this effect would be unowned (leaked)
  runWithOwner(owner, () => {
    createEffect(() => console.log("Still tracked in the original scope!"));
  });
}, 1000);
```

**Async data loading with owner preservation:**

```tsx
function AsyncLoader(props: { url: () => string }) {
  const [data, setData] = createSignal<any>(null);
  const owner = getOwner();

  createEffect(() => {
    const url = props.url();

    fetch(url)
      .then((r) => r.json())
      .then((result) => {
        // Run in the component's scope so effects are properly tracked
        runWithOwner(owner, () => {
          setData(result);
        });
      });
  });

  return () => (data() ? <DataView data={data} /> : <Loading />);
}
```

### Explicit Dependency Tracking

#### `on`

```ts
function on<S, V>(
  deps: (() => S) | readonly (() => S)[],
  fn: (input: S, prevInput: S | undefined, prev: V | undefined) => V,
): () => V | undefined;
```

Creates an explicit dependency tracker. Returns a function that, when called inside `createEffect`, tracks only the specified `deps` and runs `fn` with the current input, previous input, and previous return value.

```tsx
const [a, setA] = createSignal(1);
const [b, setB] = createSignal(10);

// Only tracks `a` -- changes to `b` do not re-run the effect
createEffect(
  on(a, (value, prev) => {
    console.log(`a changed from ${prev} to ${value}`);
    console.log("b is", b()); // reading b does NOT create a dependency
  }),
);

setA(2); // effect runs
setB(20); // effect does NOT run
```

**Multiple dependencies:**

```tsx
const [firstName, setFirstName] = createSignal("Alice");
const [lastName, setLastName] = createSignal("Smith");

createEffect(
  on([firstName, lastName], (values, prevValues) => {
    const [first, last] = values;
    console.log(`Name: ${first} ${last}`);
    if (prevValues) {
      console.log(`Was: ${prevValues[0]} ${prevValues[1]}`);
    }
  }),
);
```

**Using `on` with accumulator pattern:**

```tsx
const [count, setCount] = createSignal(0);

createEffect(
  on(count, (value, _prev, accumulator) => {
    const sum = (accumulator ?? 0) + value;
    console.log(`Running sum: ${sum}`);
    return sum; // returned value becomes `accumulator` on next run
  }),
);
```

#### `untrack`

```ts
function untrack<T>(fn: () => T): T;
```

Runs `fn` without tracking any signal reads. Maps to Pyreon's `runUntracked`.

```tsx
createEffect(() => {
  const tracked = count();
  const untracked = untrack(() => other());
  // Only re-runs when count() changes, not other()
  console.log(tracked, untracked);
});
```

**Common untrack patterns:**

```tsx
// Log current state without tracking it
createEffect(() => {
  const newValue = count();
  untrack(() => {
    console.log("Previous state snapshot:", {
      items: items(),
      filter: filter(),
    });
  });
  console.log("Count is now:", newValue);
});

// Read a config value once
createEffect(() => {
  const data = fetchedData();
  const config = untrack(() => appConfig());
  process(data, config); // only re-runs when fetchedData changes
});
```

### Batching

#### `batch`

```ts
function batch<T>(fn: () => T): T;
```

Groups multiple signal writes into a single reactive flush. Prevents intermediate states from triggering effects.

```tsx
batch(() => {
  setName("Alice");
  setAge(30);
  setRole("admin");
});
// Effects see all three changes at once
```

**Batch in event handlers:**

```tsx
function TodoItem(props: { todo: Todo; onToggle: () => void }) {
  return (
    <div
      onClick={() => {
        batch(() => {
          props.onToggle();
          setLastAction("toggle");
          setLastActionTime(Date.now());
        });
      }}
    >
      {props.todo.text}
    </div>
  );
}
```

### Lifecycle

#### `onMount`

```ts
function onMount(fn: () => void): void;
```

Runs `fn` once after the component is mounted to the DOM. Direct re-export of Pyreon's `onMount`.

```tsx
function AutoFocus() {
  let inputRef: HTMLInputElement | undefined;

  onMount(() => {
    inputRef?.focus();
  });

  return <input ref={inputRef} />;
}
```

**onMount with cleanup:**

```tsx
function WindowSize() {
  const [size, setSize] = createSignal({ width: 0, height: 0 });

  onMount(() => {
    const update = () =>
      setSize({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    update();
    window.addEventListener("resize", update);

    // In Pyreon, onMount can return a cleanup function
    return () => window.removeEventListener("resize", update);
  });

  return (
    <p>
      Window: {() => size().width}x{() => size().height}
    </p>
  );
}
```

#### `onCleanup`

```ts
function onCleanup(fn: () => void): void;
```

Registers a cleanup function that runs when the component is unmounted. Maps to Pyreon's `onUnmount`.

```tsx
const Timer = () => {
  const [elapsed, setElapsed] = createSignal(0);

  onMount(() => {
    const id = setInterval(() => setElapsed((prev) => prev + 1), 1000);
    onCleanup(() => clearInterval(id));
  });

  return <p>Elapsed: {elapsed()}s</p>;
};
```

**Cleanup for external subscriptions:**

```tsx
function EventSource(props: { channel: string }) {
  const [events, setEvents] = createSignal<Event[]>([]);

  const es = new window.EventSource(`/api/events/${props.channel}`);
  es.onmessage = (e) => setEvents((prev) => [...prev, JSON.parse(e.data)]);

  onCleanup(() => es.close());

  return (
    <ul>
      {() =>
        events().map((e) => (
          <li>
            {e.type}: {e.data}
          </li>
        ))
      }
    </ul>
  );
}
```

### Selection

#### `createSelector`

```ts
function createSelector<T>(source: () => T): (key: T) => boolean;
```

Creates an O(1) selector. Returns a function that returns `true` when `key` equals the current source value. Only the previously-selected and newly-selected keys are notified on change -- ideal for large lists.

```tsx
const [selectedId, setSelectedId] = createSignal(1);
const isSelected = createSelector(() => selectedId());

isSelected(1); // true
isSelected(2); // false

setSelectedId(2);
isSelected(1); // false
isSelected(2); // true
// Only the effects for id=1 and id=2 re-ran
```

**Selectable list:**

```tsx
function SelectableList(props: { items: () => Item[] }) {
  const [selectedId, setSelectedId] = createSignal<number | null>(null);
  const isSelected = createSelector(() => selectedId());

  return (
    <ul>
      <For each={props.items} by={(item) => item.id}>
        {(item) => (
          <li
            class={() => (isSelected(item.id) ? "selected" : "")}
            onClick={() => setSelectedId(item.id)}
          >
            {item.name}
          </li>
        )}
      </For>
    </ul>
  );
}
```

### Props Utilities

#### `mergeProps`

```ts
function mergeProps<T extends object[]>(...sources: [...T]): T[number];
```

Merges multiple prop objects into one. Preserves reactive getters (property descriptors) from source objects. Later sources override earlier ones.

```tsx
const defaults = { color: "red", size: 10, weight: "normal" };
const overrides = { size: 20, weight: "bold" };
const merged = mergeProps(defaults, overrides);
// { color: 'red', size: 20, weight: 'bold' }
```

**Using mergeProps for default props:**

```tsx
function Button(rawProps: {
  variant?: "primary" | "secondary";
  size?: "sm" | "md" | "lg";
  disabled?: boolean;
  children?: VNodeChild;
  onClick?: (e: MouseEvent) => void;
}) {
  const props = mergeProps({ variant: "primary", size: "md", disabled: false } as const, rawProps);

  return (
    <button
      class={() => `btn btn-${props.variant} btn-${props.size}`}
      disabled={props.disabled}
      onClick={props.onClick}
    >
      {props.children}
    </button>
  );
}
```

**Preserving reactive getters:**

```tsx
const dynamicProps = {
  get class() {
    return isActive() ? "active" : "inactive";
  },
  get disabled() {
    return isLoading();
  },
};

const merged = mergeProps({ class: "default" }, dynamicProps);
// merged.class reads the getter, returning the reactive value
```

#### `splitProps`

```ts
function splitProps<T, K extends (keyof T)[]>(
  props: T,
  ...keys: K
): [Pick<T, K[number]>, Omit<T, K[number]>];
```

Splits props into two objects: one with the specified keys, one with everything else. Preserves reactive getters.

```tsx
function Input(allProps: {
  label: string;
  error?: string;
  value: string;
  onInput: (e: InputEvent) => void;
  class?: string;
  id?: string;
}) {
  const [local, inputProps] = splitProps(allProps, "label", "error");

  return (
    <div class="form-field">
      <label>{local.label}</label>
      <input {...inputProps} />
      <Show when={() => local.error}>
        <span class="error">{local.error}</span>
      </Show>
    </div>
  );
}
```

**Splitting multiple groups:**

```tsx
function Card(props: {
  title: string;
  subtitle?: string;
  padding?: string;
  margin?: string;
  class?: string;
  onClick?: () => void;
  children?: VNodeChild;
}) {
  const [content, style, rest] = [
    { title: props.title, subtitle: props.subtitle, children: props.children },
    { padding: props.padding, margin: props.margin },
    { class: props.class, onClick: props.onClick },
  ];

  return (
    <div {...rest} style={() => `padding:${style.padding};margin:${style.margin}`}>
      <h3>{content.title}</h3>
      {content.subtitle && <p class="subtitle">{content.subtitle}</p>}
      {content.children}
    </div>
  );
}
```

### Children Helper

#### `children`

```ts
function children(fn: () => VNodeChild): () => VNodeChild;
```

Resolves and memoizes children. Useful when you need to iterate over or inspect child elements. The returned accessor resolves any function children (reactive getters) into their values.

```tsx
function List(props: { children: VNodeChild }) {
  const resolved = children(() => props.children);

  createEffect(() => {
    const items = resolved();
    console.log("Child count:", Array.isArray(items) ? items.length : 1);
  });

  return <ul>{resolved()}</ul>;
}
```

**Filtering and transforming children:**

```tsx
function FilteredSlot(props: { type: string; children: VNodeChild }) {
  const resolved = children(() => props.children);

  const filtered = createMemo(() => {
    const items = resolved();
    if (!Array.isArray(items)) return items;
    return items.filter(
      (item) => typeof item === "object" && item !== null && (item as any).type === props.type,
    );
  });

  return <div>{filtered()}</div>;
}
```

### Lazy Loading

#### `lazy`

```ts
function lazy<P>(
  loader: () => Promise<{ default: ComponentFn<P> }>,
): ComponentFn<P> & { preload: () => Promise<{ default: ComponentFn<P> }> };
```

Wraps a dynamic import for code splitting. The returned component renders `null` until the module resolves. Call `.preload()` to start loading before the component is rendered.

```tsx
const Dashboard = lazy(() => import("./Dashboard"));
const Settings = lazy(() => import("./Settings"));

// Preload on hover
function NavLink(props: { href: string; label: string; component: { preload: () => void } }) {
  return (
    <a href={props.href} onMouseEnter={() => props.component.preload()}>
      {props.label}
    </a>
  );
}

// Render with Suspense
<Suspense fallback={<div class="skeleton" />}>
  <Switch>
    <Match when={() => page() === "dashboard"}>
      <Dashboard />
    </Match>
    <Match when={() => page() === "settings"}>
      <Settings />
    </Match>
  </Switch>
</Suspense>;
```

### Context

#### `createContext` / `useContext`

```ts
function createContext<T>(defaultValue: T): Context<T>;
function useContext<T>(ctx: Context<T>): T;
```

Re-exports from `@pyreon/core`. Same API as SolidJS.

```tsx
const CounterContext = createContext({ count: () => 0, increment: () => {} });

function CounterProvider(props: { children: VNodeChild }) {
  const [count, setCount] = createSignal(0);

  const value = {
    count,
    increment: () => setCount((prev) => prev + 1),
  };

  return withContext(CounterContext, value, () => props.children);
}

function CounterDisplay() {
  const { count, increment } = useContext(CounterContext);

  return (
    <div>
      <p>Count: {count()}</p>
      <button onClick={increment}>+1</button>
    </div>
  );
}
```

### Control Flow Components

The following are re-exported from `@pyreon/core` and work identically to their SolidJS counterparts.

#### `Show`

Conditionally renders children when `when` is truthy. Optionally renders a `fallback` when falsy.

```tsx
<Show when={() => user()} fallback={<LoginPage />}>
  <Dashboard user={user} />
</Show>

// Nested conditions
<Show when={() => isAuthenticated()}>
  <Show when={() => hasPermission('admin')} fallback={<AccessDenied />}>
    <AdminPanel />
  </Show>
</Show>
```

#### `For`

Renders a list reactively with keyed reconciliation.

```tsx
<For each={() => items()} by={(item) => item.id}>
  {(item) => (
    <div class="item">
      <span>{item.name}</span>
      <span>${item.price}</span>
    </div>
  )}
</For>
```

**For with complex items:**

```tsx
function UserTable(props: { users: () => User[] }) {
  const [sortBy, setSortBy] = createSignal<keyof User>("name");

  const sortedUsers = createMemo(() =>
    [...props.users()].sort((a, b) => String(a[sortBy()]).localeCompare(String(b[sortBy()]))),
  );

  return (
    <table>
      <thead>
        <tr>
          <th onClick={() => setSortBy("name")}>Name</th>
          <th onClick={() => setSortBy("email")}>Email</th>
          <th onClick={() => setSortBy("role")}>Role</th>
        </tr>
      </thead>
      <tbody>
        <For each={sortedUsers} by={(u) => u.id}>
          {(user) => (
            <tr>
              <td>{user.name}</td>
              <td>{user.email}</td>
              <td>{user.role}</td>
            </tr>
          )}
        </For>
      </tbody>
    </table>
  );
}
```

#### `Switch` / `Match`

Multi-branch conditional rendering. Evaluates `Match` children in order; renders the first whose `when()` is truthy.

```tsx
<Switch fallback={<p>Unknown status</p>}>
  <Match when={() => status() === "loading"}>
    <Spinner />
  </Match>
  <Match when={() => status() === "error"}>
    <ErrorMessage error={error} />
  </Match>
  <Match when={() => status() === "ready"}>
    <Content data={data} />
  </Match>
</Switch>
```

**Route-like pattern:**

```tsx
function Router() {
  const [path, setPath] = createSignal(window.location.pathname);

  onMount(() => {
    const handler = () => setPath(window.location.pathname);
    window.addEventListener("popstate", handler);
    return () => window.removeEventListener("popstate", handler);
  });

  return (
    <Switch fallback={<NotFound />}>
      <Match when={() => path() === "/"}>
        <Home />
      </Match>
      <Match when={() => path() === "/about"}>
        <About />
      </Match>
      <Match when={() => path().startsWith("/user/")}>
        <UserProfile id={() => path().split("/")[2]} />
      </Match>
    </Switch>
  );
}
```

#### `Suspense`

Shows a fallback while async children resolve.

```tsx
<Suspense fallback={<LoadingSkeleton />}>
  <AsyncDashboard />
</Suspense>
```

#### `ErrorBoundary`

Catches errors in its subtree and renders a fallback.

```tsx
<ErrorBoundary
  fallback={(err, reset) => (
    <div class="error">
      <p>Error: {String(err)}</p>
      <button onClick={reset}>Retry</button>
    </div>
  )}
>
  <UnstableComponent />
</ErrorBoundary>
```

## Real-World Patterns

### Reactive Todo App

```tsx
import {
  createSignal,
  createMemo,
  createEffect,
  batch,
  Show,
  For,
  Switch,
  Match,
} from "@pyreon/solid-compat";

interface Todo {
  id: number;
  text: string;
  done: boolean;
}

function TodoApp() {
  const [todos, setTodos] = createSignal<Todo[]>([]);
  const [filter, setFilter] = createSignal<"all" | "active" | "done">("all");
  const [input, setInput] = createSignal("");
  let nextId = 1;

  const filteredTodos = createMemo(() => {
    switch (filter()) {
      case "active":
        return todos().filter((t) => !t.done);
      case "done":
        return todos().filter((t) => t.done);
      default:
        return todos();
    }
  });

  const remaining = createMemo(() => todos().filter((t) => !t.done).length);

  const addTodo = (e: SubmitEvent) => {
    e.preventDefault();
    const text = input().trim();
    if (!text) return;
    batch(() => {
      setTodos((prev) => [...prev, { id: nextId++, text, done: false }]);
      setInput("");
    });
  };

  const toggleTodo = (id: number) => {
    setTodos((prev) => prev.map((t) => (t.id === id ? { ...t, done: !t.done } : t)));
  };

  const removeTodo = (id: number) => {
    setTodos((prev) => prev.filter((t) => t.id !== id));
  };

  // Persist to localStorage
  createEffect(() => {
    localStorage.setItem("todos", JSON.stringify(todos()));
  });

  return (
    <div class="todo-app">
      <form onSubmit={addTodo}>
        <input
          value={() => input()}
          onInput={(e) => setInput((e.target as HTMLInputElement).value)}
          placeholder="What needs to be done?"
        />
        <button type="submit">Add</button>
      </form>

      <div class="filters">
        <button class={() => (filter() === "all" ? "active" : "")} onClick={() => setFilter("all")}>
          All
        </button>
        <button
          class={() => (filter() === "active" ? "active" : "")}
          onClick={() => setFilter("active")}
        >
          Active ({remaining()})
        </button>
        <button
          class={() => (filter() === "done" ? "active" : "")}
          onClick={() => setFilter("done")}
        >
          Done
        </button>
      </div>

      <ul>
        <For each={filteredTodos} by={(t) => t.id}>
          {(todo) => (
            <li class={todo.done ? "done" : ""}>
              <input type="checkbox" checked={todo.done} onChange={() => toggleTodo(todo.id)} />
              <span>{todo.text}</span>
              <button onClick={() => removeTodo(todo.id)}>x</button>
            </li>
          )}
        </For>
      </ul>

      <Show when={() => todos().length > 0}>
        <p class="footer">
          {remaining()} item{() => (remaining() === 1 ? "" : "s")} left
        </p>
      </Show>
    </div>
  );
}
```

### Custom Hook: createLocalStorage

```tsx
function createLocalStorage<T>(
  key: string,
  initialValue: T,
): [() => T, (v: T | ((prev: T) => T)) => void] {
  const stored = localStorage.getItem(key);
  const initial = stored ? (JSON.parse(stored) as T) : initialValue;
  const [value, setValue] = createSignal<T>(initial);

  createEffect(() => {
    localStorage.setItem(key, JSON.stringify(value()));
  });

  return [value, setValue];
}

// Usage
function Settings() {
  const [theme, setTheme] = createLocalStorage("theme", "light");
  const [fontSize, setFontSize] = createLocalStorage("fontSize", 16);

  return (
    <div>
      <select
        value={() => theme()}
        onChange={(e) => setTheme((e.target as HTMLSelectElement).value)}
      >
        <option value="light">Light</option>
        <option value="dark">Dark</option>
      </select>
      <input
        type="range"
        min="12"
        max="24"
        value={() => fontSize()}
        onInput={(e) => setFontSize(Number((e.target as HTMLInputElement).value))}
      />
    </div>
  );
}
```

### Custom Hook: createDebounced

```tsx
function createDebounced<T>(source: () => T, delay: number): () => T {
  const [debounced, setDebounced] = createSignal(source());

  createEffect(() => {
    const value = source();
    const timer = setTimeout(() => setDebounced(() => value), delay);
    onCleanup(() => clearTimeout(timer));
  });

  return debounced;
}

// Usage
function SearchBox() {
  const [query, setQuery] = createSignal("");
  const debouncedQuery = createDebounced(query, 300);

  createEffect(() => {
    const q = debouncedQuery();
    if (q) fetch(`/api/search?q=${q}`); // only fires after 300ms pause
  });

  return (
    <input
      value={() => query()}
      onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
      placeholder="Search..."
    />
  );
}
```

## Migration from solid-js/store

If you use Solid's store primitives (`createStore`, `produce`, `reconcile`), migrate to Pyreon's equivalents:

```tsx
// Before (solid-js/store)
import { createStore, produce } from "solid-js/store";

const [state, setState] = createStore({ count: 0, items: [] });
setState("count", (prev) => prev + 1);
setState(
  produce((s) => {
    s.items.push({ id: 1, text: "hello" });
  }),
);

// After (Pyreon)
import { createStore } from "@pyreon/reactivity";

const state = createStore({ count: 0, items: [] });
state.count++;
state.items.push({ id: 1, text: "hello" });
```

Key differences:

- Pyreon's `createStore` returns a single proxy object (not a `[state, setState]` tuple)
- Mutations are direct JavaScript (no path-based setter, no `produce`)
- `reconcile` is a separate function: `reconcile(newData, state)`

## Migration Checklist

1. Replace `solid-js` imports with `@pyreon/solid-compat`.
2. The signal API (`createSignal`, `createEffect`, `createMemo`) is identical -- no code changes needed.
3. Replace `solid-js/store` imports with `@pyreon/reactivity`'s `createStore` and `reconcile`. Update store mutation patterns from path-based to direct mutation.
4. Verify any `createRenderEffect` usage -- it behaves identically to `createEffect` in Pyreon.
5. Control flow components (`Show`, `For`, `Switch`, `Match`, `Suspense`, `ErrorBoundary`) work the same way.
6. Replace `useTransition` / `startTransition` with direct updates (no concurrent mode in Pyreon).
7. Replace `solid-js`'s `createResource` with `@pyreon/reactivity`'s `createResource` (same API shape but imported differently).
8. Verify `on()` usage -- same API but backed by Pyreon's effect system.
9. Test `mergeProps` and `splitProps` -- same behavior for property descriptors and reactive getters.
10. Check `children()` helper usage -- same memoization and resolution behavior.
