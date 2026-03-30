---
title: "@pyreon/reactivity"
description: Signals-based reactive primitives powering Pyreon's fine-grained reactivity system.
---

`@pyreon/reactivity` is the foundation of Pyreon's reactivity system. It provides signals, computed values, effects, stores, and other primitives that enable fine-grained, automatic dependency tracking without a virtual DOM. Every reactive update in Pyreon flows through these primitives.

<PackageBadge name="@pyreon/reactivity" href="/docs/reactivity" />

## Installation

::: code-group

```bash [npm]
npm install @pyreon/reactivity
```

```bash [bun]
bun add @pyreon/reactivity
```

```bash [pnpm]
pnpm add @pyreon/reactivity
```

```bash [yarn]
yarn add @pyreon/reactivity
```

:::

## Signals

A signal is a reactive container for a value. Reading a signal inside an effect automatically subscribes that effect to the signal. When the signal's value changes, all subscribed effects re-run. Signals use `Object.is` for equality -- setting a signal to the same value is a no-op.

```ts
import { signal } from "@pyreon/reactivity";

const count = signal(0);

// Read the value by calling the signal as a function
console.log(count()); // 0

// Set a new value
count.set(5);

// Update based on the current value
count.update((n) => n + 1); // now 6
```

### Signal Interface

```ts
interface Signal<T> {
  /** Read the current value and register a reactive dependency. */
  (): T;
  /** Read the current value WITHOUT registering a reactive dependency. */
  peek(): T;
  /** Set a new value. No-op if the new value is identical (Object.is). */
  set(value: T): void;
  /** Update the value based on the current value. */
  update(fn: (current: T) => T): void;
  /** Subscribe a static listener directly. Returns a disposer function. */
  subscribe(listener: () => void): () => void;
  /** Debug name for devtools and logging. */
  label: string | undefined;
  /** Returns a snapshot of the signal's debug info. */
  debug(): SignalDebugInfo<T>;
}

interface SignalDebugInfo<T> {
  name: string | undefined;
  value: T;
  subscriberCount: number;
}
```

### Signal Options

```ts
const name = signal("Alice", { name: "userName" });
console.log(name.debug());
// { name: "userName", value: "Alice", subscriberCount: 0 }

// You can also set the label after creation
name.label = "currentUserName";
```

The `name` option sets a debug label that appears in devtools, `debug()` output, and signal tracing.

<PropTable title="SignalOptions" :props='[
  { name: "name", type: "string", description: "Debug label for devtools and signal tracing" },
]' />

### Peeking Without Tracking

Use `peek()` to read a signal's value without creating a reactive dependency. This is essential inside effects when you need to read a value without re-running when it changes.

```ts
const count = signal(0);
const other = signal(100);

effect(() => {
  // This effect depends on `count`, but NOT on `other`
  console.log(count(), other.peek());
});

other.set(200); // effect does NOT re-run
count.set(1); // effect re-runs, reads other.peek() which is 200
```

### Direct Subscriptions

For cases where you need a fixed subscription without the overhead of an effect (no dependency tracking, no cleanup/re-tracking on each run), use `subscribe()`:

```ts
const count = signal(0);

const unsubscribe = count.subscribe(() => {
  console.log("count changed to:", count.peek());
});

count.set(1); // logs "count changed to: 1"
count.set(2); // logs "count changed to: 2"
unsubscribe(); // removes the subscription
count.set(3); // nothing logged
```

### Signal Internals

Signals are implemented as function objects with state stored as properties. Only one closure is allocated per signal (the read function). Methods like `peek`, `set`, `update`, and `subscribe` are shared implementations assigned to every signal instance, not per-signal closures. This design keeps memory overhead minimal while maintaining a clean API.

### Derived Signal Patterns

#### Signal Arrays

```ts
const items = signal<string[]>([]);

// Add an item
items.update((arr) => [...arr, "new item"]);

// Remove by index
items.update((arr) => arr.filter((_, i) => i !== 2));

// Sort
items.update((arr) => [...arr].sort());
```

#### Signal Maps

```ts
const users = signal(new Map<string, User>());

// Add a user
users.update((map) => {
  const next = new Map(map);
  next.set(user.id, user);
  return next;
});

// Delete a user
users.update((map) => {
  const next = new Map(map);
  next.delete(userId);
  return next;
});
```

#### Derived State Trees

```ts
const firstName = signal("Alice");
const lastName = signal("Smith");
const fullName = computed(() => `${firstName()} ${lastName()}`);
const greeting = computed(() => `Hello, ${fullName()}!`);
const uppercaseGreeting = computed(() => greeting().toUpperCase());

// Changing firstName propagates through the chain:
// firstName -> fullName -> greeting -> uppercaseGreeting
firstName.set("Bob");
console.log(uppercaseGreeting()); // "HELLO, BOB SMITH!"
```

## Computed

A computed value derives from other reactive sources. It is lazy by default -- it only recalculates when read, and only if its dependencies have changed.

```ts
import { signal, computed } from "@pyreon/reactivity";

const firstName = signal("Alice");
const lastName = signal("Smith");

const fullName = computed(() => `${firstName()} ${lastName()}`);

console.log(fullName()); // "Alice Smith"
firstName.set("Bob");
console.log(fullName()); // "Bob Smith"
```

### Computed Interface

```ts
interface Computed<T> {
  /** Read the computed value (tracked). Re-evaluates if dirty. */
  (): T;
  /** Remove this computed from all its reactive dependencies. */
  dispose(): void;
}
```

### Custom Equality

By default, a computed notifies downstream whenever any dependency changes. Use the `equals` option to suppress updates when the derived value has not meaningfully changed. This is especially useful for derived arrays and objects:

```ts
const items = signal([3, 1, 4, 1, 5]);

const sorted = computed(
  () =>
    items()
      .slice()
      .sort((a, b) => a - b),
  {
    equals: (prev, next) => prev.length === next.length && prev.every((v, i) => v === next[i]),
  },
);

// Downstream effects only fire when the sorted result actually changes
effect(() => {
  console.log("Sorted:", sorted());
});

// This triggers the effect (sorted output changes)
items.set([5, 3, 1]);

// This does NOT trigger the effect (sorted output is the same: [1, 3, 5])
items.set([1, 5, 3]);
```

With `equals`, the computed eagerly re-evaluates when dependencies change, but only notifies downstream effects if the equality check returns `false`.

### Disposing

Computeds are automatically disposed when their parent `EffectScope` stops. You can also dispose them manually:

```ts
const doubled = computed(() => count() * 2);
// Later:
doubled.dispose();
```

After disposal, the computed no longer reacts to dependency changes and is removed from all subscriber lists.

### Dynamic Dependency Tracking in Computed

Computed values support dynamic dependencies -- the set of dependencies can change between evaluations:

```ts
const showDetails = signal(false);
const summary = signal("Brief");
const details = signal("Full details here");

const display = computed(() => {
  if (showDetails()) {
    return details(); // tracked only when showDetails is true
  }
  return summary(); // tracked only when showDetails is false
});
```

### Computed Chains

Computeds can depend on other computeds, forming a chain:

```ts
const price = signal(100);
const quantity = signal(2);
const taxRate = signal(0.08);

const subtotal = computed(() => price() * quantity());
const tax = computed(() => subtotal() * taxRate());
const total = computed(() => subtotal() + tax());

console.log(total()); // 216

// Only quantity changed, but subtotal, tax, and total all update
quantity.set(3);
console.log(total()); // 324
```

## Effects

An effect runs a function and automatically re-runs it whenever any signal or computed it reads changes. Effects run synchronously on creation and re-run synchronously on each dependency change.

```ts
import { signal, effect } from "@pyreon/reactivity";

const count = signal(0);

const e = effect(() => {
  console.log("Count is:", count());
});
// Immediately logs "Count is: 0"

count.set(1); // logs "Count is: 1"
count.set(2); // logs "Count is: 2"

e.dispose(); // stops the effect
count.set(3); // nothing logged
```

### Effect Interface

```ts
interface Effect {
  dispose(): void;
}
```

### Dynamic Dependencies

Effects support dynamic dependency tracking. Dependencies are re-evaluated on each run, so conditional reads work correctly:

```ts
const showDetails = signal(false);
const details = signal("hidden content");

effect(() => {
  if (showDetails()) {
    console.log(details()); // only tracked when showDetails is true
  } else {
    console.log("Details hidden");
  }
});

details.set("new content"); // effect does NOT re-run (not currently tracked)
showDetails.set(true); // effect re-runs, now tracks details
details.set("updated"); // effect re-runs (now tracked)
```

### Nested Effect Patterns

Effects can create other effects. The inner effect is independent and must be disposed separately:

```ts
const enabled = signal(true);
const count = signal(0);

const outer = effect(() => {
  if (enabled()) {
    // This inner effect is created fresh each time enabled() changes to true
    const inner = effect(() => {
      console.log("Count:", count());
    });
    // Important: clean up the inner effect when the outer re-runs
    // In practice, use EffectScope for automatic cleanup
  }
});
```

### Effect Cleanup

Use `onCleanup` from `@pyreon/core` inside an effect to register a cleanup function. The cleanup runs before each re-execution and on final disposal:

```ts
import { onCleanup } from "@pyreon/core";

effect(() => {
  const q = query();
  const controller = new AbortController();
  fetch(`/search?q=${q}`, { signal: controller.signal });

  onCleanup(() => controller.abort()); // runs before next re-execution
});
```

Alternatively, use `watch` when you need old/new values along with cleanup:

```ts
watch(
  () => query(),
  (q) => {
    const controller = new AbortController();
    fetch(`/search?q=${q}`, { signal: controller.signal });
    return () => controller.abort(); // cleanup runs before next invocation
  },
);
```

### Conditional Tracking Patterns

```ts
const logLevel = signal<"debug" | "info" | "error">("info");
const debugData = signal({ calls: 0, lastArgs: null });
const errorCount = signal(0);

effect(() => {
  const level = logLevel();
  if (level === "debug") {
    // Only tracks debugData when in debug mode
    console.log("Debug:", debugData());
  } else if (level === "error") {
    // Only tracks errorCount when in error mode
    console.log("Errors:", errorCount());
  }
});
```

### Error Handling

Unhandled errors inside effects are caught and reported via a configurable error handler:

```ts
import { setErrorHandler } from "@pyreon/reactivity";

setErrorHandler((err) => {
  myErrorReporter.capture(err);
});
```

The default error handler logs to `console.error`. This ensures errors inside effects are never silently swallowed.

### renderEffect

A lightweight effect variant designed for DOM render bindings. It skips `EffectScope` registration, error handler overhead, and `onUpdate` notification. Returns a dispose function directly (not an Effect object, saving one allocation):

```ts
import { renderEffect } from "@pyreon/reactivity";

const dispose = renderEffect(() => {
  el.textContent = String(count());
});

// Later:
dispose();
```

`renderEffect` stores its dependencies in a local array instead of the global WeakMap, saving approximately 200ns per effect creation and disposal compared to `effect()`.

### \_bind

A compiler-internal static-dep binding. Tracks dependencies only on the first run and never re-tracks on subsequent runs. This makes re-runs faster because they skip cleanup, re-tracking, and tracking context save/restore entirely.

```ts
import { _bind } from "@pyreon/reactivity";

const dispose = _bind(() => {
  el.className = className();
});
```

This is used by the Pyreon compiler for template expressions where dependencies are known to be static (they never change between runs).

## Batch

Batch multiple signal updates into a single notification pass. Effects that depend on multiple updated signals only run once after the batch completes, not once per signal change.

```ts
import { signal, effect, batch } from "@pyreon/reactivity";

const first = signal("Alice");
const last = signal("Smith");

effect(() => {
  console.log(`${first()} ${last()}`);
});
// logs "Alice Smith"

// Without batch: would log twice ("Bob Smith" then "Bob Jones")
// With batch: logs once with final values
batch(() => {
  first.set("Bob");
  last.set("Jones");
});
// logs "Bob Jones" (once)
```

### Nested Batches

Batches can be nested. Notifications only flush after the outermost batch completes:

```ts
batch(() => {
  first.set("Alice");
  batch(() => {
    last.set("Johnson");
    // No flush yet -- inner batch completed but outer is still open
  });
  first.set("Bob");
  // No flush yet
});
// Now the outermost batch ends -- effects run once with final values
```

### Batch with Return Values

Batch returns the result of the callback:

```ts
const result = batch(() => {
  count.set(10);
  return count.peek(); // 10
});
```

### nextTick

Returns a Promise that resolves after all pending microtasks have flushed. Useful for reading the DOM after signal updates have settled:

```ts
import { nextTick } from "@pyreon/reactivity";

count.set(42);
await nextTick();
// DOM is now up-to-date
console.log(el.textContent); // "42"
```

`nextTick` is implemented as a simple `queueMicrotask` wrapper:

```ts
nextTick().then(() => {
  // All synchronous reactive updates from the current task are done
});
```

## Watch

Watch a reactive source and run a callback whenever it changes. More explicit than `effect` -- you specify exactly what to watch and get both old and new values. The callback also supports returning a cleanup function.

```ts
import { signal, watch } from "@pyreon/reactivity";

const userId = signal(1);

const stop = watch(
  () => userId(),
  async (newId, oldId) => {
    console.log(`Changed from ${oldId} to ${newId}`);
    const data = await fetch(`/api/user/${newId}`);
    setUser(await data.json());
  },
);

userId.set(2); // logs "Changed from 1 to 2"

// Later:
stop();
```

### Watch Interface

```ts
function watch<T>(
  source: () => T,
  callback: (newVal: T, oldVal: T | undefined) => void | (() => void),
  opts?: WatchOptions,
): () => void;

interface WatchOptions {
  /** If true, call the callback immediately with the current value on setup. */
  immediate?: boolean;
}
```

### Immediate Option

```ts
const count = signal(0);

const stop = watch(
  () => count(),
  (value, prev) => console.log(`${prev} -> ${value}`),
  { immediate: true },
);
// Immediately logs "undefined -> 0"

count.set(5); // logs "0 -> 5"
```

### Cleanup Function

The callback may return a cleanup function that runs before each re-invocation and when the watcher is stopped. This is the recommended pattern for cancellable async operations:

```ts
const stop = watch(
  () => searchQuery(),
  (query) => {
    const controller = new AbortController();

    fetch(`/api/search?q=${encodeURIComponent(query)}`, {
      signal: controller.signal,
    })
      .then((r) => r.json())
      .then((data) => results.set(data))
      .catch(() => {}); // ignore abort errors

    return () => controller.abort(); // cancel previous request
  },
);
```

### Watch vs Effect

Use `watch` when you need:

- Old and new values
- A cleanup function between runs
- Explicit control over what is watched (the source expression)

Use `effect` when you need:

- Simple reactive side effects
- Auto-tracked dependencies without specifying a source

```ts
// effect: auto-tracks everything read inside
effect(() => {
  document.title = `${count()} items`;
});

// watch: explicit source, old/new values, cleanup
watch(
  () => userId(),
  (newId, oldId) => {
    console.log(`User changed from ${oldId} to ${newId}`);
    const cleanup = setupUserSubscription(newId);
    return cleanup;
  },
);
```

## Cell

A lightweight reactive cell -- a class-based alternative to `signal()`. Cells use a single object allocation (one `new Cell()`) instead of signal's function-based approach, making them slightly cheaper to create. However, cells are **not** callable as getters, so they do not participate in automatic effect dependency tracking.

Use cells when you need reactive state with manual subscriptions rather than automatic tracking. They are ideal for keyed list reconcilers and internal framework plumbing.

```ts
import { cell, Cell } from "@pyreon/reactivity";

const count = cell(0);

count.peek(); // read the value
count.set(5); // set a new value
count.update((n) => n + 1);

// Subscribe to changes (returns unsubscribe function)
const unsub = count.subscribe(() => {
  console.log("changed to:", count.peek());
});

// Fire-and-forget subscription (no unsubscribe returned, saves 1 allocation)
count.listen(() => {
  console.log("changed!");
});
```

### Cell Interface

```ts
class Cell<T> {
  peek(): T;
  set(value: T): void;
  update(fn: (current: T) => T): void;
  listen(listener: () => void): void;
  subscribe(listener: () => void): () => void;
}

function cell<T>(value: T): Cell<T>;
```

### Single-Listener Fast Path

Cells optimize for the common case of a single listener. When only one subscriber exists, the cell stores it directly (no `Set` allocation). When a second subscriber is added, the cell promotes to a `Set`:

```ts
const c = cell("hello");
c.listen(fn1); // stored as single listener -- no Set
c.listen(fn2); // promotes to Set({ fn1, fn2 })
```

### Cell vs Signal

| Feature            | Signal                                      | Cell                                       |
| ------------------ | ------------------------------------------- | ------------------------------------------ |
| Allocation         | 1 closure (function object with properties) | 1 object (class instance)                  |
| Automatic tracking | Yes -- `signal()` call registers dependency | No -- must use `subscribe()` or `listen()` |
| Use inside effects | Yes                                         | Not directly (use `subscribe`)             |
| Methods            | Shared via assignment                       | On prototype                               |
| Best for           | General reactive state                      | Internal framework state, list item labels |

## createStore

A deep reactive Proxy store. Wraps a plain object or array in a Proxy that creates a fine-grained signal for every property. Direct mutations trigger only the signals for the mutated properties -- not the entire tree.

```ts
import { createStore, isStore } from "@pyreon/reactivity";

const state = createStore({
  count: 0,
  user: { name: "Alice", age: 30 },
  items: [{ id: 1, text: "hello" }],
});

effect(() => console.log(state.count)); // tracks state.count only
state.count++; // only the count effect re-runs
state.user.name = "Bob"; // only name-tracking effects re-run
state.items[0].text = "world"; // only text-tracking effects re-run

isStore(state); // true
isStore({}); // false
```

### Store Features

- **Fine-grained**: each property gets its own signal, so mutations only notify effects that read the specific changed property
- **Deep reactivity**: nested objects and arrays are transparently wrapped in proxies on access
- **Array support**: `push`, `pop`, `splice`, and direct index assignment all trigger reactive updates; array `length` changes are tracked via a dedicated signal
- **Proxy-based**: mutate properties directly with standard JavaScript syntax
- **Proxy caching**: each raw object gets at most one proxy (cached in a WeakMap)

### Complex Nested Mutations

```ts
const state = createStore({
  user: {
    profile: {
      name: "Alice",
      address: {
        city: "Portland",
        state: "OR",
      },
    },
    preferences: {
      theme: "dark",
      notifications: true,
    },
  },
});

// Deep mutation -- only city-tracking effects re-run
state.user.profile.address.city = "Seattle";

// Nested object replacement -- creates new proxy for the new object
state.user.preferences = { theme: "light", notifications: false };
```

### Array Operations

```ts
const state = createStore({
  items: [
    { id: 1, name: "Item 1" },
    { id: 2, name: "Item 2" },
  ],
});

// Push -- triggers length signal and adds index signal
state.items.push({ id: 3, name: "Item 3" });

// Pop -- triggers length signal
state.items.pop();

// Splice -- triggers length and affected index signals
state.items.splice(0, 1); // remove first item

// Direct index assignment
state.items[0].name = "Updated";

// Sort in place (modifies indices)
state.items.sort((a, b) => a.name.localeCompare(b.name));

// Filter and replace
const filtered = state.items.filter((item) => item.id !== 2);
state.items.length = 0;
filtered.forEach((item) => state.items.push(item));
```

### Delete Properties

```ts
const state = createStore({ temp: "value", keep: "this" });
delete state.temp; // signal for "temp" fires with undefined, then is removed
```

### Store with Effects

```ts
const appState = createStore({
  todos: [] as Array<{ id: number; text: string; done: boolean }>,
  filter: "all" as "all" | "active" | "done",
});

// This effect only re-runs when filter changes
effect(() => {
  console.log("Filter is:", appState.filter);
});

// This effect only re-runs when todos array length changes
effect(() => {
  console.log("Todo count:", appState.todos.length);
});

// This effect only re-runs when the first todo's text changes
effect(() => {
  if (appState.todos.length > 0) {
    console.log("First todo:", appState.todos[0].text);
  }
});

// Mutate -- only the relevant effects fire
appState.todos.push({ id: 1, text: "Buy milk", done: false });
appState.todos[0].done = true; // none of the above effects fire (they don't read .done)
```

## reconcile

Surgically diff new state into an existing `createStore` proxy. Instead of replacing the store root (which would trigger all downstream effects), `reconcile` walks both the new value and the store in parallel and only updates signals whose values actually changed.

```ts
import { createStore, reconcile } from "@pyreon/reactivity";

const state = createStore({
  user: { name: "Alice", age: 30 },
  items: [] as Array<{ id: number; text: string }>,
});

// API response arrives -- only changed properties trigger updates
reconcile({ user: { name: "Alice", age: 31 }, items: [{ id: 1, text: "Hello" }] }, state);
// Only state.user.age signal fires (name unchanged)
// state.items[0] is newly created
```

### How Reconcile Works

1. **Objects**: walks all keys in the source. For each key, if both source and target values are objects and the target is a store proxy, recurse. Otherwise, assign directly (the store proxy's set trap skips if `Object.is` equal). Keys present in the target but not in the source are deleted.

2. **Arrays**: reconciles by index. Elements at the same index are recursively diffed rather than replaced wholesale. Excess old elements are trimmed by setting `target.length`.

### reconcile with API Responses

```ts
const state = createStore({
  users: [] as User[],
  pagination: { page: 1, total: 0 },
});

async function fetchUsers(page: number) {
  const response = await fetch(`/api/users?page=${page}`);
  const data = await response.json();

  // Surgically update only what changed
  reconcile({ users: data.users, pagination: { page, total: data.total } }, state);
}
```

### Key-Based Reconciliation

For arrays where items have stable IDs and may be reordered, combine `reconcile` with manual key matching for best results:

```ts
// Simple index-based reconcile (default behavior)
reconcile({ items: newItems }, state);

// For reorderable lists, consider using For + mapArray instead
```

### reconcile Signature

```ts
function reconcile<T extends object>(source: T, target: T): void;
```

Both `source` (the new data) and `target` (the store proxy) must be the same shape. `source` is a plain object; `target` is a `createStore` proxy.

## createResource

Async data primitive. Reactively fetches data whenever the source signal changes. Handles loading state, errors, and request cancellation (stale requests are ignored) automatically.

```ts
import { signal, createResource } from "@pyreon/reactivity";

const userId = signal(1);

const user = createResource(
  () => userId(),
  (id) => fetch(`/api/user/${id}`).then((r) => r.json()),
);

// Reactive signals:
user.data(); // the fetched user (undefined while loading)
user.loading(); // true while in flight
user.error(); // last error, or undefined

// Manual refetch with current source value:
user.refetch();
```

### Resource Interface

```ts
interface Resource<T> {
  /** The latest resolved value (undefined while loading or on error). */
  data: Signal<T | undefined>;
  /** True while a fetch is in flight. */
  loading: Signal<boolean>;
  /** The last error thrown by the fetcher, or undefined. */
  error: Signal<unknown>;
  /** Re-run the fetcher with the current source value. */
  refetch(): void;
}

function createResource<T, P>(source: () => P, fetcher: (param: P) => Promise<T>): Resource<T>;
```

### Resource with Components

```tsx
import { signal, createResource } from "@pyreon/reactivity";
import { Show, Switch, Match } from "@pyreon/core";

function UserProfile() {
  const userId = signal(1);

  const user = createResource(
    () => userId(),
    async (id) => {
      const res = await fetch(`/api/users/${id}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
  );

  return (
    <div>
      <Switch>
        <Match when={user.loading}>
          <div class="skeleton">Loading...</div>
        </Match>
        <Match when={() => user.error() !== undefined}>
          <div class="error">
            Failed to load user: {() => String(user.error())}
            <button onClick={() => user.refetch()}>Retry</button>
          </div>
        </Match>
        <Match when={() => user.data() !== undefined}>
          <div class="profile">
            <h2>{() => user.data()!.name}</h2>
            <p>{() => user.data()!.email}</p>
          </div>
        </Match>
      </Switch>
    </div>
  );
}
```

### Stale Request Handling

`createResource` uses a request ID counter to discard stale responses. If `source()` changes while a previous fetch is in flight, the old response is ignored when it resolves:

```ts
const searchQuery = signal("react");
const results = createResource(
  () => searchQuery(),
  (q) => fetch(`/api/search?q=${q}`).then((r) => r.json()),
);

// User types quickly:
searchQuery.set("reac");
searchQuery.set("react");
searchQuery.set("reacti");
searchQuery.set("reactiv");
searchQuery.set("reactive");
// Only the "reactive" response is stored in data -- earlier responses are discarded
```

### Resource with Dependent Sources

```ts
const category = signal("electronics");
const page = signal(1);

const products = createResource(
  // Source reads both -- refetches when either changes
  () => ({ category: category(), page: page() }),
  ({ category, page }) => fetch(`/api/products?cat=${category}&page=${page}`).then((r) => r.json()),
);
```

## createSelector

Create an O(1) equality selector for efficient list selection. Unlike a plain `() => source() === value` comparison (which re-runs **all** subscribers on every change), `createSelector` only triggers the **two** affected subscribers -- the deselected and newly selected items.

```ts
import { signal, createSelector, effect } from "@pyreon/reactivity";

const selectedId = signal(1);
const isSelected = createSelector(() => selectedId());

// In each list row -- only 2 effects fire per selection change:
effect(() => {
  const active = isSelected(row.id);
  row.el.classList.toggle("selected", active);
});
```

### How createSelector Works

Internally, `createSelector` maintains a `Map<T, Set<listener>>`. Each call to `isSelected(value)` registers a subscription in the bucket for that value. When the source changes from `old` to `new`, only the `old` bucket and `new` bucket are notified -- O(1) regardless of list size.

### List Selection Example

```tsx
function SelectableList(props: { items: () => Item[] }) {
  const selectedId = signal<number | null>(null);
  const isSelected = createSelector(() => selectedId());

  return (
    <ul>
      {For({
        each: props.items,
        by: (item) => item.id,
        children: (item) => (
          <li
            class={() => (isSelected(item.id) ? "item selected" : "item")}
            onClick={() => selectedId.set(item.id)}
          >
            {item.name}
          </li>
        ),
      })}
    </ul>
  );
}
```

### Multi-Select with createSelector

For multi-select, you can use a signal holding a Set and check membership:

```ts
const selectedIds = signal(new Set<number>());

// This is O(n) per change -- for large lists, consider multiple createSelector instances
const isSelected = (id: number) => selectedIds().has(id);

// Toggle selection
function toggleSelect(id: number) {
  selectedIds.update((set) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });
}
```

### createSelector Signature

```ts
function createSelector<T>(source: () => T): (value: T) => boolean;
```

## EffectScope

An `EffectScope` automatically tracks effects and computeds created within it and disposes them all at once. This is used internally by the component system (each component gets its own scope) but can also be used standalone for managing reactive subscriptions outside of components.

```ts
import { effectScope, signal, effect, computed, setCurrentScope } from "@pyreon/reactivity";

const scope = effectScope();

// Effects/computeds created while a scope is current are auto-tracked
setCurrentScope(scope);

const count = signal(0);
const doubled = computed(() => count() * 2);
effect(() => console.log(doubled()));

setCurrentScope(null);

// Dispose everything at once
scope.stop();
// All effects and computeds are cleaned up
```

### Scope API

```ts
class EffectScope {
  /** Register an effect/computed to be disposed when this scope stops. */
  add(e: { dispose(): void }): void;
  /** Run a function within this scope (effects auto-tracked). */
  runInScope<T>(fn: () => T): T;
  /** Register a callback to run after any reactive update in this scope. */
  addUpdateHook(fn: () => void): void;
  /** Called by effects after non-initial re-runs to schedule update hooks. */
  notifyEffectRan(): void;
  /** Dispose all tracked effects and hooks. */
  stop(): void;
}
```

### runInScope

Use `runInScope` to create effects within a scope after the initial setup phase. This is essential for effects created in `onMount` callbacks:

```ts
const scope = effectScope();

// Later (e.g., in an onMount callback):
scope.runInScope(() => {
  // This effect belongs to the scope and will be disposed with it
  effect(() => console.log(count()));
});
```

### Component Lifecycle Integration

Internally, each Pyreon component gets its own `EffectScope`. When the component unmounts, `scope.stop()` disposes all effects and computeds created during setup:

```tsx
function MyComponent() {
  // These are auto-tracked by the component's scope:
  const count = signal(0);
  const doubled = computed(() => count() * 2);
  effect(() => console.log(doubled()));

  // When MyComponent unmounts:
  // - The effect is disposed
  // - The computed is disposed
  // - All subscriptions are cleaned up
  return <div>{doubled()}</div>;
}
```

### Standalone Scope for Non-Component Code

```ts
// Use a scope for reactive code outside of components
const scope = effectScope();

function startTracking() {
  scope.runInScope(() => {
    const position = signal({ x: 0, y: 0 });

    effect(() => {
      sendAnalytics("cursor", position());
    });

    window.addEventListener("mousemove", (e) => {
      position.set({ x: e.clientX, y: e.clientY });
    });
  });
}

function stopTracking() {
  scope.stop(); // all effects disposed
}
```

### Update Hooks

Scopes can notify registered update hooks after reactive effects re-run. The notification happens via microtask so all synchronous effects settle first:

```ts
const scope = effectScope();

scope.addUpdateHook(() => {
  console.log("A reactive update occurred in this scope");
});

scope.runInScope(() => {
  const count = signal(0);
  effect(() => void count()); // reads count

  count.set(1); // triggers the effect, which triggers notifyEffectRan,
  // which schedules the update hook via microtask
});
```

## runUntracked / untrack

Run a function without registering any reactive dependencies. Useful inside effects when you need to read a signal without subscribing to it. `untrack` is a shorter alias for `runUntracked` -- both are identical.

```ts
import { runUntracked, untrack, signal, effect } from "@pyreon/reactivity";

const a = signal(1);
const b = signal(2);

effect(() => {
  const aVal = a(); // tracked
  const bVal = runUntracked(() => b()); // NOT tracked
  console.log(aVal + bVal);
});

b.set(10); // effect does NOT re-run
a.set(2); // effect re-runs, reads b's current value (10), logs 12
```

### Common Use Cases

```ts
// Read config without tracking
effect(() => {
  const data = fetchedData();
  const config = runUntracked(() => appConfig());
  process(data, config);
});

// One-time snapshot
effect(() => {
  const current = count();
  const snapshot = runUntracked(() => ({
    timestamp: Date.now(),
    otherState: otherSignal(),
  }));
  logChange(current, snapshot);
});
```

## Debug Utilities

Development-only tools for tracing signal updates and understanding reactive behavior. All utilities are tree-shakeable and compile away in production when unused.

### onSignalUpdate

Register a listener that fires on every signal write. Returns a dispose function.

```ts
import { onSignalUpdate } from "@pyreon/reactivity";

const dispose = onSignalUpdate((event) => {
  console.log(`${event.name ?? "anonymous"}: ${event.prev} -> ${event.next}`);
  console.log("Stack:", event.stack);
  console.log("Time:", event.timestamp);
});

// Later: stop tracing
dispose();
```

### why()

Trace the next signal update. Logs which signals fire and what changed. Call before triggering a state change to see what updates and why:

```ts
import { why } from "@pyreon/reactivity";

why();
count.set(5);
// Console: [pyreon:why] "count": 3 -> 5 (2 subscribers)
```

`why()` auto-disposes after the current microtask, so it only captures the synchronous batch of updates.

### inspectSignal

Print a signal's current state to the console:

```ts
import { inspectSignal, signal } from "@pyreon/reactivity";

const count = signal(42, { name: "count" });
inspectSignal(count);
// Console group:
//   Signal "count"
//     value: 42
//     subscribers: 3
```

## Real-World Reactive Patterns

### Reactive Form State

```ts
import { signal, computed, effect } from "@pyreon/reactivity";

function createFormField<T>(initial: T, validate: (v: T) => string | null) {
  const value = signal(initial);
  const touched = signal(false);
  const error = computed(() => (touched() ? validate(value()) : null));
  const valid = computed(() => error() === null);

  return {
    value,
    touched,
    error,
    valid,
    set(v: T) {
      value.set(v);
      touched.set(true);
    },
    reset() {
      value.set(initial);
      touched.set(false);
    },
  };
}

// Usage
const email = createFormField("", (v) => (v.includes("@") ? null : "Invalid email"));
const password = createFormField("", (v) =>
  v.length >= 8 ? null : "Must be at least 8 characters",
);

const formValid = computed(() => email.valid() && password.valid());

effect(() => {
  console.log("Form valid:", formValid());
  console.log("Email error:", email.error());
  console.log("Password error:", password.error());
});
```

### Reactive API Layer

```ts
import { signal, createResource, batch } from "@pyreon/reactivity";

function createApi<T>(baseUrl: string) {
  const items = signal<T[]>([]);
  const loading = signal(false);
  const error = signal<string | null>(null);

  async function fetchAll() {
    loading.set(true);
    error.set(null);
    try {
      const res = await fetch(baseUrl);
      const data = await res.json();
      batch(() => {
        items.set(data);
        loading.set(false);
      });
    } catch (e) {
      batch(() => {
        error.set(String(e));
        loading.set(false);
      });
    }
  }

  async function create(item: Partial<T>) {
    const res = await fetch(baseUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(item),
    });
    const created = await res.json();
    items.update((list) => [...list, created]);
    return created;
  }

  async function remove(id: string) {
    await fetch(`${baseUrl}/${id}`, { method: "DELETE" });
    items.update((list) => list.filter((item: any) => item.id !== id));
  }

  return { items, loading, error, fetchAll, create, remove };
}

// Usage
const todosApi = createApi<Todo>("/api/todos");
todosApi.fetchAll();

effect(() => {
  if (todosApi.loading()) console.log("Loading todos...");
  else console.log("Todos:", todosApi.items().length);
});
```

### Reactive Computed Chains with Memoization

```ts
import { signal, computed } from "@pyreon/reactivity";

const rawProducts = signal<Product[]>([]);
const searchQuery = signal("");
const sortBy = signal<"name" | "price" | "rating">("name");
const sortDirection = signal<"asc" | "desc">("asc");

// Each computed only re-evaluates when its direct dependencies change
const filteredProducts = computed(() => {
  const query = searchQuery().toLowerCase();
  if (!query) return rawProducts();
  return rawProducts().filter(
    (p) => p.name.toLowerCase().includes(query) || p.description.toLowerCase().includes(query),
  );
});

const sortedProducts = computed(() => {
  const products = filteredProducts();
  const key = sortBy();
  const dir = sortDirection() === "asc" ? 1 : -1;
  return [...products].sort((a, b) => {
    if (a[key] < b[key]) return -1 * dir;
    if (a[key] > b[key]) return 1 * dir;
    return 0;
  });
});

const paginatedProducts = computed(() => {
  const page = currentPage();
  const perPage = 20;
  return sortedProducts().slice(page * perPage, (page + 1) * perPage);
});

const totalPages = computed(() => Math.ceil(sortedProducts().length / 20));
```

### Undo/Redo with Signals

```ts
import { signal } from "@pyreon/reactivity";

function createUndoable<T>(initial: T) {
  const current = signal(initial);
  const history = signal<T[]>([initial]);
  const index = signal(0);

  const canUndo = () => index() > 0;
  const canRedo = () => index() < history().length - 1;

  function set(value: T) {
    const newHistory = history().slice(0, index() + 1);
    newHistory.push(value);
    history.set(newHistory);
    index.set(newHistory.length - 1);
    current.set(value);
  }

  function undo() {
    if (!canUndo()) return;
    index.update((i) => i - 1);
    current.set(history()[index()]);
  }

  function redo() {
    if (!canRedo()) return;
    index.update((i) => i + 1);
    current.set(history()[index()]);
  }

  return { current, set, undo, redo, canUndo, canRedo };
}

const editor = createUndoable("");
editor.set("Hello");
editor.set("Hello, World");
editor.undo(); // current() === "Hello"
editor.redo(); // current() === "Hello, World"
```

## Exports Summary

### Core Primitives

<APICard name="signal" type="function" signature="signal<T>(value: T, options?: { name?: string }): Signal<T>" description="Creates a reactive signal — the fundamental unit of reactivity in Pyreon." />

<APICard name="computed" type="function" signature="computed<T>(fn: () => T, options?: { equals?: (a: T, b: T) => boolean }): Computed<T>" description="Creates a lazy derived value that re-evaluates when its dependencies change." />

<APICard name="effect" type="function" signature="effect(fn: () => void): Effect" description="Runs a function and re-runs it whenever its reactive dependencies change." />

<APICard name="watch" type="function" signature="watch<T>(source: () => T, cb: (value: T, prev: T) => (() => void) | void): () => void" description="Watches a reactive source with old/new values and optional cleanup." />

### Batching & Scheduling

<APICard name="batch" type="function" signature="batch(fn: () => void): void" description="Batches multiple signal updates into a single reactive flush." />

<APICard name="nextTick" type="function" signature="nextTick(): Promise<void>" description="Returns a promise that resolves after the current microtask flush." />

### Stores

<APICard name="createStore" type="function" signature="createStore<T extends object>(initial: T): T" description="Creates a deep reactive proxy store with automatic nested tracking." />

<APICard name="reconcile" type="function" signature="reconcile<T>(store: T, data: T): void" description="Surgically diffs new data into an existing store, minimizing reactive updates." />

### Resources

<APICard name="createResource" type="function" signature="createResource<T>(fetcher: () => Promise<T>): Resource<T>" description="Creates an async reactive resource with loading/error/data signals." />

### Scopes & Utilities

<APICard name="effectScope" type="function" signature="effectScope(): EffectScope" description="Creates a new EffectScope for grouping and disposing effects together." />

<APICard name="runUntracked" type="function" signature="runUntracked<T>(fn: () => T): T" description="Runs a function without tracking any reactive dependencies." />

<APICard name="untrack" type="function" signature="untrack<T>(fn: () => T): T" description="Alias for runUntracked. Shorter name, identical behavior." />

<APICard name="createSelector" type="function" signature="createSelector<T>(source: () => T): (key: T) => boolean" description="Creates an O(1) equality selector for efficient list item matching." />

### Debug Utilities

<APICard name="setErrorHandler" type="function" signature="setErrorHandler(handler: (error: unknown) => void): void" description="Sets the global error handler for uncaught errors in effects." />

<APICard name="onSignalUpdate" type="function" signature="onSignalUpdate(listener: (signal: Signal<unknown>) => void): () => void" description="Registers a listener called on every signal write. Useful for devtools." />

<APICard name="why" type="function" signature="why(): void" description="Traces the next signal update to console, showing which signal triggered which effects." />

<APICard name="inspectSignal" type="function" signature="inspectSignal(signal: Signal<unknown>): void" description="Prints a signal's current state, subscribers, and debug info to console." />
