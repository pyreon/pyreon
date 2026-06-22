---
title: "Complete API — API Reference"
description: "Fine-grained reactivity: signal, computed, effect, batch, onCleanup, createStore, watch, createResource, untrack"
---

# @pyreon/reactivity — API Reference

> **Generated** from `reactivity`'s `src/manifest.ts` — the same source that powers `llms.txt` and MCP `get_api`. Do not edit this page by hand; edit the manifest. For the conceptual guide, see [reactivity](/docs/reactivity).

Standalone reactive primitives — no DOM, no JSX, no framework dependency. Signals are callable functions (`count()` to read, `count.set(5)` to write, `count.update(n => n + 1)` to derive). Direct subscribers use a single-subscriber inline slot (`_d1`) promoting to a `Set` only on the 2nd subscriber (a 10k-row `<For>` allocates zero subscriber Sets); effect subscribers use a lazy `Set`; batch uses pointer swap for zero-allocation grouping. Every other Pyreon package builds on this foundation but `@pyreon/reactivity` can be used independently in Node, Bun, or browser scripts without any framework overhead. `wrapSignal(base, { set, update? })` builds a writable side-effect facade (persistence, patch emission, validation) that forwards the internal `_v` field and `.direct` by construction, so the bind-fast-path contract cannot be silently broken.

## Features

- signal&lt;T&gt;() — callable function with .set() and .update()
- computed&lt;T&gt;() — auto-tracked memoized derivation
- effect() / renderEffect() — side-effects with auto-tracking
- batch() / nextTick() — write-grouping + flush awaiter
- onCleanup() — register cleanup inside effects
- watch(source, callback) — explicit reactive watcher
- createSelector() — O(1) equality selector for keyed lists
- cell&lt;T&gt;() — lighter alternative to signal() for direct subscribe()
- createStore() / reconcile() / isStore() — deeply reactive proxy stores + structural diff
- effectScope() / getCurrentScope() — scope-based lifecycle management
- untrack() — read without subscribing
- onSignalUpdate() / inspectSignal() / why() / getReactiveTrace() — debug instrumentation
- setErrorHandler() — global hook for unhandled effect errors
- Standalone — zero DOM, zero JSX, zero framework dependency
- wrapSignal(base, &#123; set, update? &#125;) — writable side-effect facade (persistence / patch emission); forwards _v + .direct by construction

## Complete example

A full, end-to-end usage of the package:

```tsx
import { signal, computed, effect, batch, onCleanup, createStore, watch, untrack } from "@pyreon/reactivity"

// signal<T>() — callable function, NOT .value getter/setter
const count = signal(0)
count()              // read (subscribes)
count.set(5)         // write
count.update(n => n + 1)  // derive
count.peek()         // read WITHOUT subscribing

// computed<T>() — auto-tracked, memoized
const doubled = computed(() => count() * 2)

// effect() — re-runs when dependencies change
const dispose = effect(() => {
  console.log("Count:", count())
  onCleanup(() => console.log("cleaning up"))
})

// batch() — group 3+ writes into a single notification pass
batch(() => {
  count.set(10)
  count.set(20)  // subscribers fire once, with 20
})

// watch(source, callback) — explicit dependency tracking
watch(() => count(), (next, prev) => {
  console.log(`changed from ${prev} to ${next}`)
})

// createStore() — deeply reactive object (proxy-based)
const store = createStore({ todos: [{ text: 'Learn Pyreon', done: false }] })
store.todos[0].done = true  // fine-grained update, no immer needed

// untrack() — read signals without subscribing
effect(() => {
  const current = count()
  const other = untrack(() => otherSignal())  // won't re-run when otherSignal changes
})
```

## Exports

| Symbol | Kind | Summary |
| --- | --- | --- |
| [`signal`](#signal) | function | Create a reactive signal. |
| [`isServer`](#isserver) | constant | Canonical runtime environment flag — `true` when there is no DOM (`typeof document === 'undefined'`), i.e. |
| [`isClient`](#isclient) | constant | Inverse of `isServer` — `true` on a browser main thread where a DOM is available (`typeof document !== 'undefined'`). |
| [`computed`](#computed) | function | Create a memoized derived value. |
| [`effect`](#effect) | function | Run a side effect that auto-tracks signal dependencies and re-runs when they change. |
| [`renderEffect`](#rendereffect) | function | DOM-specific effect with a lighter dependency tracking path — uses a local array for deps instead of the full `EffectSco |
| [`batch`](#batch) | function | Group multiple signal writes so subscribers fire only once — after the batch completes. |
| [`nextTick`](#nexttick) | function | Returns a promise that resolves after the next microtask. |
| [`onCleanup`](#oncleanup) | function | Register a cleanup function inside an `effect()` or `renderEffect()`. |
| [`watch`](#watch) | function | Explicit reactive watcher — tracks `source` and fires `callback` when it changes. |
| [`createSelector`](#createselector) | function | Create an O(1) equality selector — returns a reactive predicate that fires only when the previously-selected and newly-s |
| [`cell`](#cell) | function | Lightweight reactive primitive — class-based alternative to `signal()`. |
| [`createStore`](#createstore) | function | Create a deeply reactive proxy-based object. |
| [`createResource`](#createresource) | function | Async data primitive. |
| [`reconcile`](#reconcile) | function | Surgically diff a new value into an existing `createStore` proxy. |
| [`isStore`](#isstore) | function | Type guard — returns `true` if the value is a `createStore` proxy (recognized via an internal symbol marker). |
| [`shallowReactive`](#shallowreactive) | function | Create a SHALLOW reactive store — only top-level mutations trigger updates. |
| [`markRaw`](#markraw) | function | Mark an object as RAW — `createStore` and `shallowReactive` will return it unwrapped. |
| [`untrack`](#untrack) | function | Execute a function reading signals WITHOUT subscribing to them. |
| [`effectScope`](#effectscope) | function | Create an `EffectScope` — a container that auto-tracks effects/computeds created inside `scope.runInScope(fn)` and dispo |
| [`onScopeDispose`](#onscopedispose) | function | Register a callback to run when the current `EffectScope` stops. |
| [`getCurrentScope`](#getcurrentscope) | function | Returns the currently active `EffectScope` (the one whose `runInScope(fn)` is on the stack), or `null` if no scope is ac |
| [`setCurrentScope`](#setcurrentscope) | function | **Low-level escape hatch** — directly set the ambient `EffectScope`. |
| [`onSignalUpdate`](#onsignalupdate) | function | Register a global trace listener that fires on every signal write. |
| [`inspectSignal`](#inspectsignal) | function | Inspect a signal — pretty-prints its current value, name, and subscriber count to the console (in a `console.group`) and |
| [`why`](#why) | function | Toggle a global "why-did-it-update?" tracer that logs every signal write between consecutive calls. |
| [`getReactiveTrace`](#getreactivetrace) | function | Returns the last ~50 signal writes (chronological, oldest → newest) from a bounded dev-only ring buffer — the causal SEQ |
| [`setErrorHandler`](#seterrorhandler) | function | Register a global handler for unhandled errors thrown inside `effect()` / `computed()` / `renderEffect()`. |
| [`activateReactiveDevtools`](#activatereactivedevtools) | function | Opt-in lifecycle for the reactive-devtools bridge — the live signal/computed/effect graph the `@pyreon/devtools` Signals |
| [`getReactiveGraph`](#getreactivegraph) | function | Fresh snapshot of the live reactive graph + a bounded recent-fire timeline, for the reactive-devtools tabs. |
| [`wrapSignal`](#wrapsignal) | function | Create a signal facade over a base signal with custom write behavior. |
| [`WrapSignalOptions`](#wrapsignaloptions) | type | Configuration object for `wrapSignal()`. |

## API

### signal `function`

```ts
<T>(initialValue: T, options?: { name?: string }) => Signal<T>
```

Create a reactive signal. The returned value is a CALLABLE FUNCTION — `count()` reads (and subscribes), `count.set(v)` writes, `count.update(fn)` derives, `count.peek()` reads without subscribing. This is NOT a `.value` getter/setter pattern (React/Vue) — Pyreon signals are functions. Optional `{ name }` for debugging; auto-injected by `@pyreon/vite-plugin` in dev mode.

**Example**

```tsx
const count = signal(0)
count()              // 0 (subscribes to updates)
count.set(5)         // sets to 5
count.update(n => n + 1)  // 6
count.peek()         // 6 (does NOT subscribe)
```

**Common mistakes**

- `count.value` — does not exist. Use `count()` to read
- `count = 5` — reassigning the variable replaces the signal, does not write to it. Use `count.set(5)`
- `signal(5)` called with an argument after creation — reads and ignores the argument (dev mode warns). Use `.set(5)` to write
- `const [val, setVal] = signal(0)` — signals are not destructurable tuples. The whole return value IS the signal
- `{count}` in JSX — renders the signal function itself, not its value. Use `{count()}` or `{() => count()}`
- `.peek()` inside `effect()` / `computed()` — bypasses tracking, creates stale reads. Only use `.peek()` for loop-prevention guards

**See also:** `computed` · `effect` · `batch`

---

### isServer `constant`

```ts
const isServer: boolean
```

Canonical runtime environment flag — `true` when there is no DOM (`typeof document === 'undefined'`), i.e. during SSR / in a Node or edge worker. `typeof document` is the reliable "is there a DOM" discriminator; it is more correct than `typeof window`, which misreports Deno and polyfilled-Node setups. A plain constant evaluated once at module load — correct in every runtime with zero bundler configuration. Use it for small environment guards (module-level singletons, lazy globals, render output that differs server vs client). `isClient` is its inverse.

**Example**

```tsx
import { isServer } from '@pyreon/reactivity'
if (isServer) return // bail on the server
window.addEventListener('resize', onResize)
```

**Common mistakes**

- Rolling your own `const isBrowser = typeof window !== 'undefined'` instead — `typeof window` misreports Deno / polyfilled Node; import `isServer` / `isClient`
- Reaching for `isClient` to gate DOM access inside a component — prefer `onMount` / `effect`, which never run during SSR
- Putting heavy server-only code behind `isServer` in a client-imported module — it still ships to the client bundle; use a `/server` subpath export instead

**See also:** `isClient`

---

### isClient `constant`

```ts
const isClient: boolean
```

Inverse of `isServer` — `true` on a browser main thread where a DOM is available (`typeof document !== 'undefined'`). A plain constant evaluated once at module load. Use it for small environment guards; for DOM access inside a component prefer `onMount` / `effect` (which never run during SSR).

**Example**

```tsx
import { isClient } from '@pyreon/reactivity'
const initial = isClient ? navigator.onLine : true
```

**Common mistakes**

- Rolling your own `const isBrowser = typeof window !== 'undefined'` instead — import `isClient`
- Using `isClient` to defer DOM work that belongs in `onMount` / `effect`

**See also:** `isServer`

---

### computed `function`

```ts
<T>(fn: () => T, options?: { equals?: (a: T, b: T) => boolean }) => Computed<T>
```

Create a memoized derived value. Dependencies auto-tracked on each evaluation — no dependency array needed (unlike React `useMemo`). Only recomputes when a tracked signal actually changes. Custom `equals` function prevents downstream effects from firing on structurally-equal updates (default: `Object.is`).

**Example**

```tsx
const count = signal(0)
const doubled = computed(() => count() * 2)
doubled()  // 0
count.set(5)
doubled()  // 10
```

**Common mistakes**

- `computed(() => count)` — must CALL the signal: `computed(() => count())`
- Using `computed()` for side effects — use `effect()` instead; computed is for pure derivation
- Expecting `computed()` to re-run when a `.peek()`-read signal changes — `.peek()` bypasses tracking

**See also:** `signal` · `effect`

---

### effect `function`

```ts
(fn: () => (() => void) | void) => () => void
```

Run a side effect that auto-tracks signal dependencies and re-runs when they change. Returns a dispose function that unsubscribes. The effect function can return a cleanup callback (equivalent to calling `onCleanup()` inside the body) — the cleanup runs before each re-execution and on final dispose. For DOM-specific effects with lighter overhead, use `renderEffect()` instead.

**Example**

```tsx
const count = signal(0)
const dispose = effect(() => {
  console.log("Count:", count())
  onCleanup(() => console.log("cleaning up"))
})
// Or return cleanup directly:
effect(() => {
  const handler = () => console.log(count())
  window.addEventListener("resize", handler)
  return () => window.removeEventListener("resize", handler)
})
```

**Common mistakes**

- Passing a dependency array — Pyreon auto-tracks; no array needed
- `effect(() => { count })` — must call the signal: `effect(() => { count() })`
- Nesting `effect()` inside `effect()` — use `computed()` for derived values instead
- Creating signals inside an effect — they re-create on every run; create once outside

**See also:** `onCleanup` · `computed` · `renderEffect`

---

### renderEffect `function`

```ts
(fn: () => void) => () => void
```

DOM-specific effect with a lighter dependency tracking path — uses a local array for deps instead of the full `EffectScope` integration. Used internally by `_bind` / `_tpl` for compiled-template DOM updates. **Prefer `effect()` for general use**; reach for `renderEffect()` only when you're hand-writing DOM update logic and have measured the overhead difference. Returns a dispose function (not an `Effect` object — different shape from `effect()`).

**Example**

```tsx
// Inside a custom DOM helper that updates a text node:
const node = document.createTextNode('')
const dispose = renderEffect(() => {
  node.data = String(count())
})
// Re-runs only when count() changes; lighter than effect() but no
// onCleanup support, no scope auto-disposal, no error-handler routing.
```

**Common mistakes**

- Calling `onCleanup()` inside `renderEffect()` — not supported; only `effect()` collects cleanups. Use `effect()` if you need cleanup callbacks
- Expecting `renderEffect()` to auto-dispose with the surrounding scope — it does NOT register with `EffectScope`. Component-scoped DOM effects should use `effect()` so they tear down on unmount
- Reaching for `renderEffect()` as the default — `effect()` is the canonical primitive. The performance delta only matters in extreme hot paths (1000+ DOM nodes), never in component-level code

**See also:** `effect` · `computed`

---

### batch `function`

```ts
(fn: () => void) => void
```

Group multiple signal writes so subscribers fire only once — after the batch completes. Uses pointer swap (zero allocation). Essential when updating 3+ signals that downstream effects read together; without batch, each `.set()` triggers an independent notification pass.

**Example**

```tsx
const a = signal(1)
const b = signal(2)
batch(() => {
  a.set(10)
  b.set(20)
})
// Effects that read both a() and b() fire once, not twice
```

**Common mistakes**

- Reading a signal inside `batch()` and expecting the NEW value before the batch completes — reads inside the batch see the new value (writes are synchronous), but effects fire only after the batch callback returns
- Forgetting `batch()` when updating 3+ related signals — causes N intermediate re-renders

**See also:** `signal` · `effect`

---

### nextTick `function`

```ts
() => Promise<void>
```

Returns a promise that resolves after the next microtask. Use to await pending reactive updates — every signal write that happens before `nextTick()` is fully flushed (effects ran, computeds settled, DOM patched) by the time the promise resolves. Equivalent to Vue's `nextTick`. Useful in tests and in code that needs to read the post-update DOM state.

**Example**

```tsx
count.set(5)
// Effects haven't run yet (sync writes are queued)
await nextTick()
// Now everything is flushed — DOM reflects count = 5
expect(node.textContent).toBe('5')
```

**Common mistakes**

- Awaiting `nextTick()` inside a `batch()` callback — pointless; the batch flushes when the callback returns, not when the microtask drains. Move the await outside `batch()`
- Using `nextTick()` to defer work — it doesn't schedule anything; it just resolves on the next microtask. Use `setTimeout` / `requestAnimationFrame` for actual deferral

**See also:** `batch`

---

### onCleanup `function`

```ts
(fn: () => void) => void
```

Register a cleanup function inside an `effect()` or `renderEffect()`. Runs before each re-execution of the effect (when dependencies change) and once on final dispose. Equivalent to returning a cleanup function from the effect body — both forms work, `onCleanup` is useful when you need to register cleanup at a different point than the end of the body.

**Example**

```tsx
effect(() => {
  const handler = () => console.log(count())
  window.addEventListener("resize", handler)
  onCleanup(() => window.removeEventListener("resize", handler))
})
```

**Common mistakes**

- Using `onCleanup` outside an effect — it only works inside `effect()` or `renderEffect()` body
- Confusing with `onUnmount` — `onCleanup` is for effects, `onUnmount` is for component lifecycle

**See also:** `effect`

---

### watch `function`

```ts
<T>(source: () => T, callback: (next: T, prev: T) => void, options?: WatchOptions) => () => void
```

Explicit reactive watcher — tracks `source` and fires `callback` when it changes. Unlike `effect()`, the callback receives both `next` and `prev` values and does NOT auto-track signals read inside the callback body. `source` is evaluated at setup time to establish tracking; reading browser globals there still fires SSR lint rules. Returns a dispose function.

**Example**

```tsx
watch(() => count(), (next, prev) => {
  console.log(`changed from ${prev} to ${next}`)
})
```

**Common mistakes**

- Reading browser globals in the `source` function — it runs at setup time (not just in mounted context), so `no-window-in-ssr` fires on `window.X` there
- Expecting signals read inside the `callback` to be tracked — only the `source` function establishes tracking; the callback is untracked
- Forgetting to return a cleanup function from the callback — `watch` honors a returned function as a cleanup that runs before each re-run AND on dispose. Useful for cancelling in-flight requests, clearing timers, or removing listeners attached on the previous run

**See also:** `effect` · `computed`

---

### createSelector `function`

```ts
<T>(source: () => T) => (value: T) => boolean
```

Create an O(1) equality selector — returns a reactive predicate that fires only when the previously-selected and newly-selected values' subscribers are affected. Unlike a plain `() => source() === value` (which re-evaluates for every row in a list), this only triggers TWO subscribers per source change (deselected + newly selected) regardless of list size. Critical for keyed-list selection patterns.

**Example**

```tsx
const selectedId = signal<string | null>(null)
const isSelected = createSelector(() => selectedId())

// In each row's render — O(1) selection updates regardless of N rows:
<For each={rows} by={r => r.id}>{row => (
  <li class={isSelected(row.id) ? 'selected' : ''}>
    {row.label}
  </li>
)}</For>
```

**Common mistakes**

- Using a plain `() => source() === value` in lists — every row subscribes to source; selecting a row notifies ALL N rows (O(N))
- Calling `isSelected` outside a reactive scope — returns the current value but doesn't subscribe
- Using `createSelector` for non-equality predicates — it's purpose-built for `===` matching; for ranges or filters, use `computed()`

**See also:** `signal` · `computed`

---

### cell `function`

```ts
<T>(value: T) => Cell<T>
```

Lightweight reactive primitive — class-based alternative to `signal()`. **1 object allocation vs `signal()`'s ~6 closures**, single-listener fast path (no Set allocated when ≤1 subscriber), methods on prototype shared across instances. **NOT callable as a getter** — does not integrate with effect dependency tracking. Use when you need reactive state but plan to subscribe directly via `.subscribe()` / `.listen()`, NOT via `effect()`. Ideal for keyed-list row labels where the subscription lifetime equals the row's lifetime.

**Example**

```tsx
import { cell } from '@pyreon/reactivity'

// Create a cell:
const label = cell('Initial')

// Read (no tracking — read inside an effect does NOT subscribe):
label.peek()             // 'Initial'

// Write:
label.set('Updated')
label.update(s => s + '!')

// Subscribe directly (returns disposer):
const dispose = label.subscribe(() => console.log(label.peek()))

// Fire-and-forget — no disposer (saves 1 closure allocation):
label.listen(() => console.log('changed'))
```

**Common mistakes**

- Using `label()` to read — Cells are NOT callable. Use `label.peek()` to read
- Reading `label.peek()` inside `effect()` and expecting tracked re-runs — Cells don't integrate with effect tracking. Use `signal()` if you need automatic dependency tracking
- Using `cell()` for ALL reactive state — only switch from `signal()` when you've measured allocation pressure (1000+ instances) AND you don't need effect-based subscriptions

**See also:** `signal`

---

### createStore `function`

```ts
<T extends object>(initial: T) => T
```

Create a deeply reactive proxy-based object. Mutations at any depth trigger fine-grained updates — `store.todos[0].done = true` only re-runs effects that read `store.todos[0].done`, not effects that read `store.todos.length` or other items. No immer, no spread-copy, no `produce()` — just mutate. Works with nested plain objects and arrays. Built-in types with internal slots (`Map`, `Set`, `WeakMap`, `WeakSet`, `Date`, `RegExp`, `Promise`, `Error`) are returned raw and are NOT deeply reactive — they fail the Proxy internal-slot check on every method call. Replace the whole field (`store.users = new Map(store.users)`) to trigger reactivity for these.

**Example**

```tsx
const store = createStore({
  todos: [{ text: 'Learn Pyreon', done: false }],
  filter: 'all',
})
store.todos[0].done = true   // fine-grained — only 'done' subscribers fire
store.todos.push({ text: 'Build app', done: false })  // array methods work
```

**Common mistakes**

- Replacing the entire store object — `store = { ... }` replaces the variable, not the proxy. Mutate properties instead: `store.filter = "active"`
- Destructuring store properties at setup — `const { filter } = store` captures the value once, losing reactivity. Read `store.filter` inside reactive scopes
- Using `createStore` for simple scalar state — use `signal()` for primitives; `createStore` adds proxy overhead that only pays off for nested objects
- Expecting fine-grained reactivity inside Map/Set/Date/RegExp/Promise — these are returned raw because Proxy can't intercept methods that rely on internal slots. Mutating the raw instance (`store.users.set(...)`) does NOT notify subscribers. Replace the whole field (`store.users = new Map(store.users)`) to trigger reactivity

**See also:** `signal`

---

### createResource `function`

```ts
<T, P>(source: () => P, fetcher: (param: P) => Promise<T>) => Resource<T>
```

Async data primitive. Auto-fetches whenever `source()` changes — `data`, `loading`, `error` are signals readable inside effects. Stale-response guarded via internal `requestId` (typing fast then slow does not flicker old data). `refetch()` re-runs the fetcher with the current source value. **`dispose()` MUST be called for resources created outside an `EffectScope`** — otherwise the source-tracking effect leaks for the lifetime of the program.

**Example**

```tsx
const userId = signal(1)
const user = createResource(
  () => userId(),
  (id) => fetch(`/api/users/${id}`).then(r => r.json()),
)
effect(() => {
  if (user.loading()) return
  if (user.error()) return console.error(user.error())
  console.log(user.data())
})
userId.set(2)            // auto-refetches
user.refetch()           // explicit refetch with current source
user.dispose()           // stop tracking, discard in-flight response
```

**Common mistakes**

- Forgetting `dispose()` for resources outside an EffectScope — the internal source-tracking effect runs forever, leaking memory and unbounded fetch calls on source changes
- Calling `refetch()` after `dispose()` — silently no-ops; check disposed state on your end if needed
- Reading `data()` without checking `loading()` / `error()` — undefined values flow through; gate the read on those signals
- Expecting an in-flight response to update the resource AFTER `dispose()` — the response is discarded by design (stale-id check), `loading` may stay frozen at its dispose-time value
- Reading signals INSIDE the fetcher and expecting tracked re-runs — only `source()` is tracked; signals read inside `fetcher` are read once per call without subscription

**See also:** `signal` · `effect` · `effectScope`

---

### reconcile `function`

```ts
<T extends object>(source: T, target: T) => void
```

Surgically diff a new value into an existing `createStore` proxy. Walks both trees in parallel and only calls `.set()` on signals whose value actually changed — unchanged subtrees do NOT re-run their effects. Ideal for applying API responses to a long-lived store: only the truly-changed fields trigger updates, even if you receive a fully-replacement payload from the server. Arrays reconcile by index; excess elements are removed.

**Example**

```tsx
const state = createStore({ user: { name: 'Alice', age: 30 }, items: [] })

// API response arrives — pure replacement payload:
reconcile(
  { user: { name: 'Alice', age: 31 }, items: [{ id: 1 }] },
  state,
)
// → only state.user.age signal fires (name unchanged)
// → state.items[0] is newly created, length signal fires
```

**Common mistakes**

- Passing a non-store as `target` — `reconcile` requires a `createStore` proxy; for plain objects, just assign
- Expecting reconciliation by key for arrays — arrays are reconciled BY INDEX. For keyed list reconciliation, use a Map keyed by id and reconcile each entry by key, OR replace the array reference (which `<For>` reconciles via `by`)
- Using `reconcile` inside an effect — it triggers writes; you'd cycle. Call it outside reactive scopes (e.g. in a query callback or event handler)

**See also:** `createStore` · `signal`

---

### isStore `function`

```ts
(value: unknown) => boolean
```

Type guard — returns `true` if the value is a `createStore` proxy (recognized via an internal symbol marker). Use to differentiate reactive stores from plain objects in code that handles both shapes (e.g. helpers that conditionally `reconcile()` vs assign).

**Example**

```tsx
const a = createStore({ x: 1 })
const b = { x: 1 }
isStore(a)  // true
isStore(b)  // false
isStore(null)  // false (null-safe)
```

**Common mistakes**

- Using `isStore` to detect ANY proxy — it's specific to Pyreon's store proxies. Other proxies return `false`
- Calling on `null` / `undefined` and expecting a throw — null-safe; returns `false`

**See also:** `createStore` · `reconcile`

---

### shallowReactive `function`

```ts
<T extends object>(initial: T) => T
```

Create a SHALLOW reactive store — only top-level mutations trigger updates. Nested objects are NOT auto-wrapped; reading a nested object returns the raw reference, and mutating it does NOT trigger any effect. Replacing the top-level reference DOES trigger reactivity. Use when nested data is immutable (frozen API responses), when you want explicit control over which subtrees are reactive, or when you need to store class instances/third-party objects without paying the deep-proxy overhead. Vue 3 parity.

**Example**

```tsx
const store = shallowReactive({ user: { name: 'Alice' }, count: 0 })
effect(() => store.count)        // tracks store.count
effect(() => store.user)         // tracks store.user reference (not its contents)
store.user.name = 'Bob'          // does NOT trigger any effect (nested mutation)
store.count = 5                  // triggers count effect
store.user = { name: 'Bob' }     // triggers user effect (reference replacement)
```

**Common mistakes**

- Expecting nested mutations to trigger effects — they don't. Use `createStore` if you need deep reactivity, or replace the top-level reference (`store.user = { ...store.user, name: 'Bob' }`)
- Mixing shallow + deep on the same raw object — `createStore(raw)` and `shallowReactive({ wrapper: raw })` produce DIFFERENT proxies (separate caches). Pick one shape per data flow

**See also:** `createStore` · `markRaw`

---

### markRaw `function`

```ts
<T extends object>(value: T) => T
```

Mark an object as RAW — `createStore` and `shallowReactive` will return it unwrapped. Useful for class instances, third-party objects, DOM nodes, or any shape that shouldn't be deeply proxied (Vue 3 parity). Marking is one-way: there's no `unmarkRaw`. Mark BEFORE the object enters a store; marking after wrap doesn't unwrap an existing proxy.

**Example**

```tsx
import { markRaw, createStore } from '@pyreon/reactivity'

class Editor { /* ... */ }
const ed = markRaw(new Editor())   // skips proxy
const store = createStore({ editor: ed })
store.editor === ed                 // true — raw reference preserved
store.editor.someMethod()           // works — class methods see real receiver
```

**Common mistakes**

- Marking an object AFTER it's been wrapped — the existing proxy is unaffected. Mark before the object enters any store
- Expecting `markRaw(obj)` to return a different object — it mutates `obj` and returns the SAME reference (with the marker symbol attached)
- Using markRaw on plain data objects to "skip" deep wrap — for that, use `shallowReactive`. markRaw is for class instances and externally-managed shapes

**See also:** `createStore` · `shallowReactive`

---

### untrack `function`

```ts
(fn: () => T) => T
```

Execute a function reading signals WITHOUT subscribing to them. Alias for `runUntracked`. Use inside effects when you need to read a signal's current value as a one-shot snapshot without the effect re-running when that signal changes.

**Example**

```tsx
effect(() => {
  const current = count()        // tracked — effect re-runs on count change
  const other = untrack(() => otherSignal())  // NOT tracked — just reads the current value
})
```

**Common mistakes**

- Using `untrack` as the default — signals should be tracked by default; `untrack` is the escape hatch for specific optimization or loop-prevention cases

**See also:** `signal` · `effect`

---

### effectScope `function`

```ts
() => EffectScope
```

Create an `EffectScope` — a container that auto-tracks effects/computeds created inside `scope.runInScope(fn)` and disposes them all at once via `scope.stop()`. `@pyreon/core`'s `mountReactive` uses this internally for component lifetime management. **Always use a scope for effects created outside a component's setup phase** (e.g. in event handlers, route loaders, or async-await chains) — without one, effects leak for the lifetime of the program.

**Example**

```tsx
import { effectScope, signal, effect } from '@pyreon/reactivity'

const scope = effectScope()
const count = signal(0)

scope.runInScope(() => {
  effect(() => console.log(count()))    // tracked by scope
})

count.set(5)   // logs 5
scope.stop()   // tears down all effects in the scope
count.set(10)  // no log — effect was disposed
```

**Common mistakes**

- Forgetting `scope.stop()` — effects leak for the lifetime of the program; same shape as forgetting `dispose()` on a top-level `effect()`
- Creating effects outside `runInScope(fn)` and expecting them to be tracked — effects must run during the synchronous body of `runInScope` to register with the scope
- Stopping a scope that has pending updates — in-flight microtasks may still fire `onUpdate` hooks; design for idempotency or check `isActive` before writes

**See also:** `effect` · `getCurrentScope` · `onScopeDispose`

---

### onScopeDispose `function`

```ts
(fn: () => void) => void
```

Register a callback to run when the current `EffectScope` stops. Vue 3 parity. Captures the AMBIENT scope at registration time, so it must be called inside `scope.runInScope(fn)`. Calling outside any scope is a no-op (with a dev warning). Use for resource cleanup tied to scope lifetime — timers, listeners, external subscriptions. Equivalent to `getCurrentScope()?.add({ dispose: fn })` but without the boilerplate.

**Example**

```tsx
scope.runInScope(() => {
  const ws = new WebSocket(url)
  onScopeDispose(() => ws.close())
  // ws.close() runs when scope.stop() is called
})
```

**Common mistakes**

- Calling outside any scope — silently no-ops in production, dev warns. The callback is dropped on the floor; verify with `getCurrentScope()` before calling if scope is uncertain
- Expecting the callback to run on EFFECT cleanup — `onScopeDispose` fires only on `scope.stop()`. For per-effect cleanup, use `onCleanup()` inside the effect body or return a cleanup function from it
- Using outside `runInScope` and inside an effect callback — the effect captures whatever scope was ambient when the effect SET UP, not when the registration runs. Effects re-run later may see a different ambient scope; register at setup, not in the body

**See also:** `effectScope` · `getCurrentScope` · `onCleanup`

---

### getCurrentScope `function`

```ts
() => EffectScope | null
```

Returns the currently active `EffectScope` (the one whose `runInScope(fn)` is on the stack), or `null` if no scope is active. Use to register cleanup with the surrounding scope, or to detect "am I inside a component lifetime?" — useful for library code that wants to register an effect with the consumer's scope rather than the global one.

**Example**

```tsx
import { getCurrentScope } from '@pyreon/reactivity'

function myReactiveResource() {
  const scope = getCurrentScope()
  if (scope) {
    // Inside a component — register cleanup with the component's scope
    scope.add({ dispose: cleanup })
  } else {
    // Top-level / standalone — caller must call dispose() manually
    console.warn('myReactiveResource: no active scope; remember to dispose')
  }
}
```

**Common mistakes**

- Calling `getCurrentScope()` outside any scope and expecting a default — returns `null`. Handle the no-scope case explicitly
- Using `getCurrentScope()` as a substitute for `effectScope()` — it returns the AMBIENT scope, not a fresh one

**See also:** `effectScope` · `setCurrentScope`

---

### setCurrentScope `function`

```ts
(scope: EffectScope | null) => void
```

**Low-level escape hatch** — directly set the ambient `EffectScope`. Use only when implementing scope-aware framework primitives (e.g. `mountReactive`, custom render boundaries). Most code should use `scope.runInScope(fn)` which sets and restores via try/finally. Pairing `setCurrentScope(s)` with a manual `setCurrentScope(prev)` is error-prone — `runInScope` is the safe form.

**Example**

```tsx
// Inside a custom render boundary that needs to swap scopes mid-flow:
const prev = getCurrentScope()
setCurrentScope(myScope)
try {
  doWork()
} finally {
  setCurrentScope(prev)
}
// Or — preferred:
myScope.runInScope(() => doWork())
```

**Common mistakes**

- Forgetting to restore the previous scope — leaks effects to the wrong owner forever
- Using `setCurrentScope` instead of `runInScope` in user code — the safe API is `runInScope`

**See also:** `effectScope` · `getCurrentScope`

---

### onSignalUpdate `function`

```ts
(listener: (event: { signal, name, prev, next, stack, timestamp }) => void) => () => void
```

Register a global trace listener that fires on every signal write. Returns a disposer. **Dev/debug only** — every signal write incurs the listener call. Use for time-travel debugging, recording reactive transcripts in tests, or building devtools panels. Multiple listeners are supported (each gets every event).

**Example**

```tsx
import { onSignalUpdate, signal } from '@pyreon/reactivity'

const dispose = onSignalUpdate(e => {
  console.log(`${e.name ?? '(anonymous)'}: ${e.prev} → ${e.next}`)
})
const count = signal(0, { name: 'count' })
count.set(5)   // logs: count: 0 → 5
dispose()      // remove listener
```

**Common mistakes**

- Leaving `onSignalUpdate` registered in production — fires on EVERY signal write, even hot-path internal ones. Always dispose when done
- Throwing inside the listener — corrupts the signal's notification flow (the listener fires after `_v` is updated but before subscribers are notified). Wrap your handler in try/catch
- Expecting the event to capture writes that occur via batch flushes — the event fires per `set()` call, regardless of batch state

**See also:** `inspectSignal` · `why`

---

### inspectSignal `function`

```ts
<T>(sig: Signal<T>) => SignalDebugInfo<T>
```

Inspect a signal — pretty-prints its current value, name, and subscriber count to the console (in a `console.group`) and returns the debug info object. Useful for one-shot inspection while debugging; for continuous tracing use `onSignalUpdate`.

**Example**

```tsx
const count = signal(0, { name: 'count' })
inspectSignal(count)
// Console group:
//   🔍 Signal "count"
//     value: 0
//     subscribers: 2
```

**Common mistakes**

- Calling `inspectSignal` in production — produces console noise. Gate calls behind `if (import.meta.env.DEV)` or `__DEV__`

**See also:** `onSignalUpdate` · `why`

---

### why `function`

```ts
() => void
```

Toggle a global "why-did-it-update?" tracer that logs every signal write between consecutive calls. Calling once arms the tracer; calling again disarms it and dumps the captured transcript. **Dev/debug only.** Useful for hunting "why did this effect just re-run?" — wrap a suspicious operation, call `why()` before and after, see exactly which signals changed.

**Example**

```tsx
why()         // arm tracer
clickButton()  // any signal writes here are captured
why()         // disarm + dump transcript:
//   [pyreon:why] "filter": "all" → "active" (12 subscribers)
//   [pyreon:why] "scrollY": 0 → 240 (1 subscriber)
```

**Common mistakes**

- Calling `why()` once and forgetting to call it again — keeps tracing forever, leaks the listener, prints nothing until disarmed
- Using `why()` in production — pure dev tool

**See also:** `onSignalUpdate` · `inspectSignal`

---

### getReactiveTrace `function`

```ts
() => Array<{ name: string | undefined; prev: string; next: string; timestamp: number }>
```

Returns the last ~50 signal writes (chronological, oldest → newest) from a bounded dev-only ring buffer — the causal SEQUENCE of reactive state changes, not a point-in-time snapshot. `@pyreon/core` attaches this to `ErrorContext.reactiveTrace` automatically so error reports carry "what changed in the run-up to the crash". Entries hold bounded string previews of values (never raw refs — no memory pinning, always serializable). **Dev-only**: the recorder feeding the buffer is behind the production dead-code gate and tree-shakes out, so this returns `[]` in prod builds. Distinct from `onSignalUpdate` — that is opt-in and captures stacks; this is always-on, deliberately cheap, and exists to enrich error reports. `clearReactiveTrace()` resets it (test isolation).

**Example**

```tsx
import { getReactiveTrace, clearReactiveTrace, signal } from '@pyreon/reactivity'

const status = signal('idle', { name: 'status' })
status.set('submitting')
getReactiveTrace()
// [{ name: 'status', prev: '"idle"', next: '"submitting"', timestamp: 1234.5 }]
clearReactiveTrace()  // → []
```

**Common mistakes**

- Expecting it to return signal VALUES — it returns string PREVIEWS (truncated, safely stringified). For live values inspect the signal directly
- Relying on it in production — returns `[]` (the recorder is dev-gated and tree-shaken). Use it for dev tooling / error-report enrichment, not runtime logic
- Treating it as a snapshot of all signals — it is a bounded ring of recent WRITES; signals never written (or written before the ~50-entry window) are absent

**See also:** `onSignalUpdate` · `inspectSignal`

---

### setErrorHandler `function`

```ts
(fn: (err: unknown) => void) => void
```

Register a global handler for unhandled errors thrown inside `effect()` / `computed()` / `renderEffect()`. Without a handler, errors are logged to `console.error` and the effect re-throws (potentially crashing the surrounding frame). With one, the framework calls your handler with the thrown value and continues. Use for telemetry / error-boundary integration. **One handler only — calling twice replaces the first.**

**Example**

```tsx
setErrorHandler(err => {
  reportToSentry(err)
  toast.error('Something went wrong')
})

effect(() => {
  if (count() > 100) throw new Error('count too high')
})
count.set(101)  // logs/reports via handler instead of crashing
```

**Common mistakes**

- Calling `setErrorHandler` multiple times and expecting all to fire — the second call REPLACES the first. Compose multiple handlers manually if you need a chain
- Throwing inside the handler — the framework will swallow this too, but you lose visibility. Make handlers no-throw (try/catch internally if needed)
- Expecting the handler to receive errors from `signal.set()` writes — only effect-runtime errors are routed. Synchronous errors at write time bubble up normally

**See also:** `effect` · `renderEffect`

---

### activateReactiveDevtools `function`

```ts
activateReactiveDevtools(): void  ·  deactivateReactiveDevtools(): void  ·  isReactiveDevtoolsActive(): boolean
```

Opt-in lifecycle for the reactive-devtools bridge — the live signal/computed/effect graph the `@pyreon/devtools` Signals/Graph/Effects/Profiler tabs consume (surfaced on the browser hook as `window.__PYREON_DEVTOOLS__.reactive`). **Zero cost until activated**: every per-primitive instrumentation point early-returns on the inactive flag and sits inside the production dead-code gate, so it tree-shakes out of prod builds entirely (locked by a minified-bundle test) and, in dev, costs one predicted-false branch until a devtools client calls `activate()` — the same risk profile as the adjacent reactive-trace / perf-harness calls. `deactivate()` drops all retained registry + fire-buffer state (a closed panel leaves zero residue). Leak-free by construction: nodes are held via `WeakRef` + `FinalizationRegistry`, never pinned.

**Example**

```tsx
import { activateReactiveDevtools, getReactiveGraph } from '@pyreon/reactivity'

// Only AFTER activation are subsequently-created signals tracked.
activateReactiveDevtools()
const price = signal(10, { name: '$price' })
const total = computed(() => price() * 2)
effect(() => total())
getReactiveGraph().nodes // → [$price (signal), derived, effect]
deactivateReactiveDevtools() // → registry cleared
```

**Common mistakes**

- Expecting nodes created BEFORE `activate()` to appear — registration is gated on the active flag (mirrors a devtools panel attaching). Activate first, then build/observe the graph
- Calling it in production for app logic — the whole bridge is dev-gated and tree-shaken; `getReactiveGraph()` returns an empty graph in prod builds
- Assuming it tracks compiler-emitted DOM bindings — only user `signal()` / `computed()` / `effect()` are registered; `renderEffect` / `_bind` plumbing is intentionally excluded (it would flood the graph and tax the hottest path)

**See also:** `getReactiveGraph` · `onSignalUpdate` · `getReactiveTrace`

---

### getReactiveGraph `function`

```ts
getReactiveGraph(): { nodes: ReactiveNode[]; edges: { from: number; to: number }[] }  ·  getReactiveFires(): { id: number; ts: number }[]
```

Fresh snapshot of the live reactive graph + a bounded recent-fire timeline, for the reactive-devtools tabs. `getReactiveGraph()` returns every tracked node (`{ id, kind: "signal"|"derived"|"effect", name, value, subscribers, fires, lastFire }`) plus dependency edges recomputed on demand from the real subscriber `_s` Sets (source → subscriber: signal→derived, derived→effect) — always consistent with the framework’s actual subscription state, no incremental drift. `getReactiveFires()` returns a fixed-size ring buffer of recent fires (`{ id, ts }`, oldest → newest) powering the Effects/Profiler tabs. Both require `activateReactiveDevtools()` first and return empty otherwise. Names come from `signal(v, { name })` / the vite-plugin dev auto-naming; anonymous computeds/effects get a synthetic `derived#id` / `effect#id`.

**Example**

```tsx
activateReactiveDevtools()
const a = signal(1, { name: '$a' })
const b = computed(() => a() + 1)
effect(() => b())
a.set(2)
getReactiveGraph()
// nodes: [{ name:'$a', kind:'signal', value:'2', … }, { kind:'derived', … }, { kind:'effect', … }]
// edges: [{ from:$a, to:derived }, { from:derived, to:effect }]
getReactiveFires() // → [{ id, ts }, …]  (bounded, chronological)
```

**Common mistakes**

- Holding the returned arrays expecting them to update — they are point-in-time snapshots; call again (the devtools panel polls)
- Reading `node.value` for non-string state as the real value — it is a bounded, safely-stringified PREVIEW (never a raw ref — no pinning). Inspect the signal directly for the live value
- Expecting fires for every write in a long-running app — `getReactiveFires()` is a fixed-size ring; older entries roll off

**See also:** `activateReactiveDevtools` · `getReactiveTrace` · `onSignalUpdate`

---

### wrapSignal `function`

```ts
<T>(base: Signal<T>, options: WrapSignalOptions<T>) => Signal<T>
```

Create a signal facade over a base signal with custom write behavior. The canonical way to build a signal whose write runs a side effect (persistence, validation, patch emission). Reads and the internal `_v` field are delegated to `base`, so the facade satisfies the full signal contract the compiler's fast paths depend on — a facade that exposes `.direct()` but forgets `_v` (or vice-versa) silently binds to `undefined` and renders empty. `wrapSignal` forwards both by construction, making hand-rolled facades structurally impossible to get wrong.

**Example**

```tsx
const base = signal(0)
const wrapped = wrapSignal(base, {
  set: (v) => {
    base.set(v)
    localStorage.setItem('key', JSON.stringify(v))
  },
})
wrapped.set(5)  // writes through custom logic
console.log(wrapped())  // 5 (reads from base)
```

**Common mistakes**

- Forgetting to call `base.set(value)` inside the custom `set` handler — the signal's internal `_v` never updates, so reads stall at the old value and compiled fast paths see stale data.
- Hand-rolling a facade that exposes `.direct()` but not the `_v` property — the compiler's `_bindText` fast path reads `source._v` directly to skip the function call; without it, text bindings render empty even though `()` works.
- Capturing the `base` signal reference in closure and forgetting to return the facade itself — callers that track per-instance subscription identity (e.g. `.remove()` on shared state) break because every call returns the same identity.
- Using `wrapSignal` to add tracking to a signal that's written from multiple code paths without coordinating in the custom `set` handler — the side effect runs on EVERY write, including batch-deferred ones; if other code writes directly to `base` it bypasses the facade.
- Expecting the custom `update` option to be optional AND have a default — if not provided, it defaults to `set(fn(base.peek()))`, which may not match your intent if `set` has expensive side effects (it will run for every update, even pure derive ops).

**See also:** `signal` · `effect` · `computed`

---

### WrapSignalOptions `type`

```ts
interface WrapSignalOptions<T> { set: (value: T) => void; update?: (fn: (current: T) => T) => void }
```

Configuration object for `wrapSignal()`. The `set` handler runs in place of the base signal's `.set()`; call through to `base.set(value)` when the value should actually update. The optional `update` handler defaults to `set(fn(peek()))` — override it if you need custom batch or coalescing behavior that `.set()` alone doesn't express.

**Example**

```tsx
const store = createStore({ count: 0 })
const countSig = signal(store.count)
const wrapped = wrapSignal(countSig, {
  set: (v) => {
    countSig.set(v)
    store.count = v  // dual-write to store
  },
  update: (fn) => {
    const next = fn(countSig.peek())
    wrapped.set(next)  // coordinated update
  },
})
```

**Common mistakes**

- `set` handler not calling through to `base.set()` — the wrapped signal's value never updates internally, all reads stall.
- Providing `update` that doesn't eventually call `set` — reads won't reflect the update unless `set` is involved in the chain.
- Expecting the default `update` to coalesce rapid-fire calls — it calls `set()` directly, so if `set` has side effects (persist, emit), they fire on every update call without coalescing.
- Using the same `options` object for multiple `wrapSignal()` calls on different bases — the `set` and `update` closures capture the wrong `base` reference if reused.

**See also:** `wrapSignal` · `Signal`

---

## Package-level notes

> **Signals are callable functions:** Pyreon signals are NOT `.value` getters (Vue ref) or `[state, setState]` tuples (React useState). The signal IS the function: `count()` reads, `count.set(v)` writes, `count.update(fn)` derives. This is the #1 confusion for developers coming from other frameworks.

> **No dependency arrays:** `effect()` and `computed()` auto-track dependencies on each execution — no `[dep1, dep2]` array needed. Every signal read inside the body is a tracked dependency. This means conditional reads (`if (cond()) { return x() }`) only track `x` when `cond()` is true.

> **Standalone:** `@pyreon/reactivity` has zero dependencies. Use it in Node/Bun scripts, edge workers, or any JavaScript environment without pulling in the rest of the framework. `@pyreon/core` and `@pyreon/runtime-dom` build on it but are not required.
