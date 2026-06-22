---
title: "Complete API — API Reference"
description: "VNode, h(), Fragment, lifecycle, context, JSX runtime, Suspense, ErrorBoundary, lazy(), Dynamic, cx(), splitProps, mergeProps, createUniqueId"
---

# @pyreon/core — API Reference

> **Generated** from `core`'s `src/manifest.ts` — the same source that powers `llms.txt` and MCP `get_api`. Do not edit this page by hand; edit the manifest. For the conceptual guide, see [core](/docs/core).

Component model and lifecycle for Pyreon. Provides the VNode type system, `h()` hyperscript function, JSX automatic runtime (`@pyreon/core/jsx-runtime`), lifecycle hooks (`onMount`, `onUnmount`), two-tier context system (`createContext` for static values, `createReactiveContext` for signal-backed values), control-flow components (`Show`, `Switch`/`Match`, `For`, `Suspense`, `ErrorBoundary`), code-splitting via `lazy()`, dynamic rendering via `Dynamic`, and props utilities (`splitProps`, `mergeProps`, `cx`, `createUniqueId`). Components are plain functions (`ComponentFn<P> = (props: P) => VNodeChild`) that run ONCE — reactivity comes from reading signals inside reactive scopes, not from re-running the component.

## Exports

| Symbol | Kind | Summary |
| --- | --- | --- |
| [`h`](#h) | function | Create a VNode from a component function, HTML tag string, or symbol (Fragment, Portal). |
| [`Fragment`](#fragment) | constant | Symbol used as the type for fragment VNodes that group children without producing a wrapper DOM element. |
| [`onMount`](#onmount) | function | Register a callback that runs after the component mounts into the DOM. |
| [`onUnmount`](#onunmount) | function | Register a callback that runs when the component is removed from the DOM. |
| [`onUpdate`](#onupdate) | function | Register a callback that runs after the component updates (reactive dependencies change and DOM patches complete). |
| [`onErrorCaptured`](#onerrorcaptured) | function | Register an error handler that captures errors thrown by descendant components. |
| [`createContext`](#createcontext) | function | Create a static context. |
| [`createReactiveContext`](#createreactivecontext) | function | Create a reactive context. |
| [`provide`](#provide) | function | Push a context value for all descendant components. |
| [`useContext`](#usecontext) | function | Read the nearest provided value for a context. |
| [`Show`](#show) | component | Reactive conditional rendering. |
| [`Switch`](#switch) | component | Multi-branch conditional rendering. |
| [`Match`](#match) | component | A branch inside a `<Switch>`. |
| [`For`](#for) | component | Keyed reactive list rendering. |
| [`Suspense`](#suspense) | component | Async boundary that shows `fallback` while any `lazy()` component or async child inside is loading. |
| [`ErrorBoundary`](#errorboundary) | component | Catches render errors thrown by descendant components. |
| [`lazy`](#lazy) | function | Wrap a dynamic import for code splitting. |
| [`Dynamic`](#dynamic) | component | Renders a component by reference or string tag name. |
| [`cx`](#cx) | function | Combine class values into a single string. |
| [`splitProps`](#splitprops) | function | Split a props object into two parts: the picked keys and the rest. |
| [`mergeProps`](#mergeprops) | function | Merge multiple props objects with last-source-wins semantics. |
| [`removeUndefinedProps`](#removeundefinedprops) | function | Copy a props object, dropping keys whose DATA value is exactly `undefined` while preserving every getter-shaped (reactiv |
| [`createUniqueId`](#createuniqueid) | function | Generate a unique string ID ("pyreon-1", "pyreon-2", ...) that is consistent between server and client when called in th |
| [`Portal`](#portal) | component | Render children into a DOM element outside the component tree (typically `document.body`). |
| [`mapArray`](#maparray) | function | Low-level reactive array mapping used internally by `<For>`. |
| [`createRef`](#createref) | function | Create a mutable ref object (`{ current: T \| null }`) for holding DOM element references. |
| [`untrack`](#untrack) | function | Execute a function reading signals WITHOUT subscribing to them. |
| [`nativeCompat`](#nativecompat) | function | Mark a Pyreon framework component as "self-managing" so compat layers (`@pyreon/{react,preact,vue,solid}-compat`) skip t |
| [`isNativeCompat`](#isnativecompat) | function | Compat-layer-side: read whether a function has been marked as a Pyreon native framework component via `nativeCompat()`. |
| [`NATIVE_COMPAT_MARKER`](#native-compat-marker) | constant | The well-known registry symbol (`Symbol.for("pyreon:native-compat")`) used to mark a component as a Pyreon native framew |
| [`ExtractProps`](#extractprops) | type | Extracts the props type from a `ComponentFn`. |
| [`HigherOrderComponent`](#higherordercomponent) | type | Typed HOC pattern where `HOP` is the props the HOC adds and `P` is the wrapped component's own props. |

## API

### h `function`

```ts
h<P extends Props>(type: ComponentFn<P> | string | symbol, props: P | null, ...children: VNodeChild[]): VNode
```

Create a VNode from a component function, HTML tag string, or symbol (Fragment, Portal). Low-level API — prefer JSX which compiles to `h()` calls (or `_tpl()` + `_bind()` for template-optimized paths). Children are stored in `vnode.children`; components must merge them via `props.children = vnode.children.length === 1 ? vnode.children[0] : vnode.children`.

**Example**

```tsx
const vnode = h("div", { class: "container" },
  h("h1", null, "Hello"),
  h(Counter, { initial: 0 })
)
```

**Common mistakes**

- `h("div", "text")` — second arg is always props (or null). Text children go in the third+ positions: `h("div", null, "text")`
- `h(MyComponent, { children: <span /> })` — children go as rest args, not a prop: `h(MyComponent, null, <span />)`
- `h("input", { className: "x" })` — use `class` not `className` (Pyreon uses standard HTML attributes)
- `h("input", { onChange: handler })` — use `onInput` for keypress-by-keypress updates (native DOM events)

**See also:** `Fragment` · `Dynamic` · `lazy`

---

### Fragment `constant`

```ts
Fragment: symbol
```

Symbol used as the type for fragment VNodes that group children without producing a wrapper DOM element. In JSX, `<>...</>` compiles to `h(Fragment, null, ...)`. Useful when a component needs to return multiple sibling elements.

**Example**

```tsx
// JSX:
<>
  <h1>Title</h1>
  <p>Content</p>
</>

// h() API:
h(Fragment, null, h("h1", null, "Title"), h("p", null, "Content"))
```

**See also:** `h`

---

### onMount `function`

```ts
onMount(fn: () => CleanupFn | void): void
```

Register a callback that runs after the component mounts into the DOM. The callback can optionally return a cleanup function that runs on unmount — this is the idiomatic pattern for event listeners, timers, and subscriptions. Must be called during component setup (the synchronous function body), not inside effects or async callbacks.

**Example**

```tsx
const Timer = () => {
  const count = signal(0)

  onMount(() => {
    const id = setInterval(() => count.update(n => n + 1), 1000)
    return () => clearInterval(id)  // cleanup on unmount
  })

  return <div>{count()}</div>
}
```

**Common mistakes**

- Forgetting cleanup: `onMount(() => { const id = setInterval(...) })` leaks the interval. Return cleanup: `return () => clearInterval(id)`
- Using `onMount` + separate `onUnmount` for paired setup/teardown — prefer returning cleanup from `onMount` instead
- Calling `onMount` inside an `effect()` or async callback — it only works during synchronous component setup
- Accessing DOM refs before mount — the callback runs AFTER mount, which is the right place for DOM measurements

**See also:** `onUnmount` · `onUpdate`

---

### onUnmount `function`

```ts
onUnmount(fn: () => void): void
```

Register a callback that runs when the component is removed from the DOM. For paired setup/teardown, prefer returning a cleanup function from `onMount` instead — it co-locates the cleanup with the setup. `onUnmount` is useful when cleanup needs to reference state computed separately from the mount callback.

**Example**

```tsx
onUnmount(() => {
  console.log("Component removed from DOM")
})
```

**See also:** `onMount`

---

### onUpdate `function`

```ts
onUpdate(fn: () => void): void
```

Register a callback that runs after the component updates (reactive dependencies change and DOM patches complete). Rarely needed — most update logic belongs in `effect()` or `computed()`. Useful for imperative DOM measurements that need to run after all reactive updates have flushed.

**Example**

```tsx
onUpdate(() => {
  console.log("Component updated, DOM is current")
})
```

**See also:** `onMount` · `onUnmount`

---

### onErrorCaptured `function`

```ts
onErrorCaptured(fn: (error: unknown) => boolean | void): void
```

Register an error handler that captures errors thrown by descendant components. Return `false` to prevent the error from propagating further up the tree. Works alongside `ErrorBoundary` for programmatic error handling.

**Example**

```tsx
onErrorCaptured((error) => {
  console.error("Caught:", error)
  return false  // stop propagation
})
```

**See also:** `ErrorBoundary`

---

### createContext `function`

```ts
createContext<T>(defaultValue: T): Context<T>
```

Create a static context. `useContext()` returns the value directly (`T`), so it is safe to destructure. Use this for values that do not change after being provided (theme name, locale string, config object). For values that change reactively (mode signal, locale signal), use `createReactiveContext` instead — otherwise consumers capture a stale snapshot at setup time.

**Example**

```tsx
const ThemeCtx = createContext<"light" | "dark">("light")

// Provide:
const App = () => {
  provide(ThemeCtx, "dark")
  return <Child />
}

// Consume:
const Child = () => {
  const theme = useContext(ThemeCtx)  // "dark" — safe to destructure
  return <div class={theme}>...</div>
}
```

**Common mistakes**

- `provide(ThemeCtx, () => modeSignal())` with a static context — the consumer receives the function itself, not the signal value. Use `createReactiveContext` for dynamic values
- Destructuring a reactive context value: `const { mode } = useContext(reactiveCtx)` captures once. Keep the object reference and access lazily
- Calling `useContext` outside a component body — it reads from the component context stack, which only exists during setup

**See also:** `createReactiveContext` · `provide` · `useContext`

---

### createReactiveContext `function`

```ts
createReactiveContext<T>(defaultValue: T): ReactiveContext<T>
```

Create a reactive context. `useContext()` returns `() => T` — an accessor that must be called to read the current value. Use this for values that change over time (mode, locale, user). The accessor subscribes to updates when read inside reactive scopes (`effect()`, JSX thunks, `computed()`).

**Example**

```tsx
const ModeCtx = createReactiveContext<"light" | "dark">("light")

// Provide:
const App = () => {
  const mode = signal<"light" | "dark">("dark")
  provide(ModeCtx, () => mode())
  return <Child />
}

// Consume:
const Child = () => {
  const getMode = useContext(ModeCtx)  // () => "dark"
  return <div class={getMode()}>...</div>
}
```

**See also:** `createContext` · `provide` · `useContext`

---

### provide `function`

```ts
provide<T>(ctx: Context<T> | ReactiveContext<T>, value: T): void
```

Push a context value for all descendant components. Auto-cleans up on unmount. Must be called during component setup (synchronous function body). Preferred over manual `pushContext`/`popContext`. For reactive values, provide a getter function to a `ReactiveContext`: `provide(ModeCtx, () => modeSignal())`.

**Example**

```tsx
const ThemeCtx = createContext<"light" | "dark">("light")

function App() {
  provide(ThemeCtx, "dark")
  return <Child />
}
```

**Common mistakes**

- `provide(ctx, "static")` for a value that changes — use `createReactiveContext` + `provide(ctx, () => signal())`
- Calling `provide` inside `onMount` or `effect` — it must run during synchronous component setup
- Providing the same context twice in one component — the second `provide` shadows the first for that subtree

**See also:** `createContext` · `createReactiveContext` · `useContext`

---

### useContext `function`

```ts
useContext<T>(ctx: Context<T>): T
```

Read the nearest provided value for a context. For static `Context<T>`, returns `T` directly. For `ReactiveContext<T>`, returns `() => T` — must call the accessor to read. Falls back to the default value if no ancestor provides the context.

**Example**

```tsx
const theme = useContext(ThemeContext)  // static: returns T
const getMode = useContext(ModeCtx)    // reactive: returns () => T
```

**See also:** `provide` · `createContext` · `createReactiveContext`

---

### Show `component`

```ts
<Show when={condition} fallback={alternative}>{children}</Show>
```

Reactive conditional rendering. Mounts children when `when` is truthy, unmounts and shows `fallback` when falsy. More efficient than ternary for signal-driven conditions because it avoids re-evaluating the entire branch expression on every signal change — `Show` only transitions between mounted/unmounted when the boolean flips. `when` accepts BOTH a value (`when={true}`, `when={signal()}`) and an accessor (`when={() => signal()}`) — the framework normalizes via `typeof === "function"`. The accessor form is required for true reactivity (the framework re-evaluates it on signal change); a bare `when={signal}` reference works because the compiler's signal auto-call rewrites it to `when={signal()}`.

**Example**

```tsx
<Show when={isLoggedIn()} fallback={<LoginForm />}>
  <Dashboard />
</Show>
```

**Common mistakes**

- `{cond() ? <A /> : <B />}` — works but less efficient than `<Show>` for signal-driven conditions
- `<Show when={items().length}>` — works (truthy check), but be explicit: `<Show when={items().length > 0}>`
- `<Show when={signal}>` (bare reference) — relies on the compiler's signal auto-call to rewrite to `when={signal()}`. Works defensively but use `when={() => signal()}` for explicit accessor semantics across the entire reactive lifecycle.

**See also:** `Switch` · `Match` · `For`

---

### Switch `component`

```ts
<Switch fallback={default}>{Match children}</Switch>
```

Multi-branch conditional rendering. Renders the first `<Match>` child whose `when` prop is truthy. If no match, renders the `fallback`. More readable than nested `<Show>` for multi-way conditions.

**Example**

```tsx
<Switch fallback={<p>Unknown status</p>}>
  <Match when={status() === "loading"}>
    <Spinner />
  </Match>
  <Match when={status() === "error"}>
    <ErrorDisplay />
  </Match>
  <Match when={status() === "success"}>
    <Results />
  </Match>
</Switch>
```

**See also:** `Match` · `Show`

---

### Match `component`

```ts
<Match when={condition}>{children}</Match>
```

A branch inside a `<Switch>`. Renders its children when `when` is truthy and it is the first truthy `<Match>` in the parent `<Switch>`. Must be a direct child of `<Switch>`. `when` accepts both a value and an accessor (same normalization as `<Show>`).

**Example**

```tsx
<Switch>
  <Match when={tab() === "home"}><Home /></Match>
  <Match when={tab() === "settings"}><Settings /></Match>
</Switch>
```

**See also:** `Switch` · `Show`

---

### For `component`

```ts
<For each={items} by={keyFn}>{renderFn}</For>
```

Keyed reactive list rendering. Uses the `by` prop (not `key`) for the key function because JSX extracts `key` as a special VNode reconciliation prop. The render function receives each item and its index. Internally uses an LIS-based reconciler for minimal DOM mutations when the list changes.

**Example**

```tsx
const items = signal([
  { id: 1, name: "Apple" },
  { id: 2, name: "Banana" },
])

<For each={items()} by={item => item.id}>
  {(item, index) => <li>{item.name}</li>}
</For>
```

**Common mistakes**

- `<For each={items}>` — must call the signal: `<For each={items()}>`
- `<For each={items()} key={...}>` — use `by` not `key` (JSX reserves `key` for VNode reconciliation)
- `{items().map(...)}` — use `<For>` for reactive list rendering; `.map()` re-creates all DOM nodes on every change
- `<For each={items()} by={index}>` — using array index as key defeats the reconciler; use a stable identity like `item.id`

**See also:** `Show` · `mapArray`

---

### Suspense `component`

```ts
<Suspense fallback={loadingUI}>{children}</Suspense>
```

Async boundary that shows `fallback` while any `lazy()` component or async child inside is loading. SSR mode streams the fallback immediately and swaps in the resolved content when ready (30s timeout). Nested Suspense boundaries are independent — an inner boundary resolving does not affect the outer.

**Example**

```tsx
const LazyPage = lazy(() => import("./HeavyPage"))

<Suspense fallback={<div>Loading...</div>}>
  <LazyPage />
</Suspense>
```

**See also:** `lazy` · `ErrorBoundary`

---

### ErrorBoundary `component`

```ts
<ErrorBoundary onCatch={handler} fallback={errorUI}>{children}</ErrorBoundary>
```

Catches render errors thrown by descendant components. The `fallback` receives the error object for display. `onCatch` fires with the error for logging/telemetry. Without an ErrorBoundary, uncaught errors propagate to the nearest `registerErrorHandler` or crash the app.

**Example**

```tsx
<ErrorBoundary
  onCatch={(err) => console.error(err)}
  fallback={(err) => <div>Error: {err.message}</div>}
>
  <App />
</ErrorBoundary>
```

**See also:** `Suspense` · `onErrorCaptured`

---

### lazy `function`

```ts
lazy(loader: () => Promise<{ default: ComponentFn }>, options?: LazyOptions): LazyComponent
```

Wrap a dynamic import for code splitting. Returns a component that integrates with `Suspense` — the parent Suspense boundary shows its fallback until the import resolves. The loaded component is cached after first resolution.

**Example**

```tsx
const Settings = lazy(() => import("./pages/Settings"))

// Use in JSX (wrap with Suspense):
<Suspense fallback={<Spinner />}>
  <Settings />
</Suspense>
```

**See also:** `Suspense` · `Dynamic`

---

### Dynamic `component`

```ts
<Dynamic component={comp} {...props} />
```

Renders a component by reference or string tag name. Useful when the component to render is determined at runtime (tab panels, plugin systems, polymorphic containers). When `component` changes, the previous component unmounts and the new one mounts.

**Example**

```tsx
const components = { home: HomePage, about: AboutPage }
const current = signal("home")

<Dynamic component={components[current()]} />
```

**See also:** `lazy` · `h`

---

### cx `function`

```ts
cx(...values: ClassValue[]): string
```

Combine class values into a single string. Accepts strings, booleans (falsy values ignored), objects (`{ active: true }`), and arrays (nested). The `class` prop on JSX elements already accepts `ClassValue` directly, so explicit `cx()` is only needed when building class strings outside JSX or when composing values from multiple sources.

**Example**

```tsx
cx("foo", "bar")                         // "foo bar"
cx("base", isActive && "active")         // conditional
cx({ base: true, active: isActive() })   // object syntax
cx(["a", ["b", { c: true }]])            // nested arrays

// class prop accepts ClassValue directly:
<div class={["base", cond && "active"]} />
<div class={{ base: true, active: isActive() }} />
```

**See also:** `splitProps` · `mergeProps`

---

### splitProps `function`

```ts
splitProps<T, K extends keyof T>(props: T, keys: K[]): [Pick<T, K>, Omit<T, K>]
```

Split a props object into two parts: the picked keys and the rest. Both halves preserve signal reactivity — reads through either half still track the original reactive prop getters. This is the Pyreon replacement for `const { x, ...rest } = props` destructuring, which captures values once and loses reactivity.

**Example**

```tsx
const Button = (props: { class?: string; onClick: () => void; children: VNodeChild }) => {
  const [local, rest] = splitProps(props, ["class"])
  return <button {...rest} class={cx("btn", local.class)} />
}
```

**Common mistakes**

- `const { class: cls, ...rest } = props` — destructuring captures once, loses reactivity. Use `splitProps(props, ["class"])`
- Passing a non-props object — `splitProps` relies on reactive getter descriptors that the compiler creates on props objects
- Forgetting that symbol-keyed props are preserved — `splitProps` uses `Reflect.ownKeys` so symbols (like `REACTIVE_PROP`) survive

**See also:** `mergeProps` · `cx`

---

### mergeProps `function`

```ts
mergeProps<T extends object[]>(...sources: T): MergedProps<T>
```

Merge multiple props objects with last-source-wins semantics. Reads are lazy — the merged object delegates to the source objects via getters, so signal reactivity is preserved. Commonly used to inject default props: `mergeProps({ size: "md" }, props)`. Forces `configurable: true` on copied descriptors to prevent "Cannot redefine property" errors.

**Example**

```tsx
const Button = (props: { size?: string; variant?: string }) => {
  const merged = mergeProps({ size: "md", variant: "primary" }, props)
  return <button class={`btn-${merged.size} btn-${merged.variant}`} />
}
```

**Common mistakes**

- `Object.assign({}, defaults, props)` — loses reactivity. Use `mergeProps(defaults, props)` instead
- `mergeProps(props, defaults)` — wrong order. Defaults go FIRST, actual props last (last source wins)

**See also:** `splitProps` · `cx`

---

### removeUndefinedProps `function`

```ts
removeUndefinedProps<T>(props: T): { [K in keyof T as T[K] extends undefined ? never : K]: T[K] }
```

Copy a props object, dropping keys whose DATA value is exactly `undefined` while preserving every getter-shaped (reactive) prop verbatim. The descriptor-aware filter a prop-forwarding HOC runs before `mergeProps`: an `undefined` consumer prop must not shadow a default, but a compiler-emitted reactive prop must survive with its subscription intact. Copies property descriptors (never values) — a value-copy would fire each getter at setup time and collapse the live signal to a static snapshot. `null` / `0` / `""` / `false` are kept; only `undefined` data props are dropped, and getter descriptors are always kept (cannot peek without firing).

**Example**

```tsx
const filtered = removeUndefinedProps(props) // undefined keys gone, getters live
const merged = mergeProps(defaults, filtered)
```

**Common mistakes**

- `result[key] = props[key]` to filter — fires getter-shaped reactive props, collapsing the subscription. Use this helper (it copies descriptors)
- Expecting `null` / `0` / `false` to be dropped — only `undefined` data values are removed
- Calling on `undefined` — `Object.getOwnPropertyDescriptors(undefined)` throws; guard the input

**See also:** `mergeProps` · `splitProps` · `makeReactiveProps`

---

### createUniqueId `function`

```ts
createUniqueId(): string
```

Generate a unique string ID ("pyreon-1", "pyreon-2", ...) that is consistent between server and client when called in the same order. SSR-safe — the counter resets per request context. Use for `id`/`for`/`aria-*` attribute pairing in components.

**Example**

```tsx
const LabeledInput = (props: { label: string }) => {
  const id = createUniqueId()
  return (
    <>
      <label for={id}>{props.label}</label>
      <input id={id} />
    </>
  )
}
```

**See also:** `splitProps`

---

### Portal `component`

```ts
<Portal target={element}>{children}</Portal>
```

Render children into a DOM element outside the component tree (typically `document.body`). Useful for modals, tooltips, and overlays that need to escape parent overflow/z-index stacking contexts. Context values from the Portal source tree are preserved.

**Example**

```tsx
<Portal target={document.body}>
  <div class="modal-overlay">
    <div class="modal">Content</div>
  </div>
</Portal>
```

**See also:** `Dynamic`

---

### mapArray `function`

```ts
mapArray<T, U>(list: () => T[], mapFn: (item: T, index: () => number) => U): () => U[]
```

Low-level reactive array mapping used internally by `<For>`. Maps a reactive array signal through a transform function, caching results per item identity. Prefer `<For>` in JSX — use `mapArray` only when you need a reactive derived array outside of rendering.

**Example**

```tsx
const items = signal([1, 2, 3])
const doubled = mapArray(() => items(), (item) => item * 2)
// doubled() → [2, 4, 6] — updates reactively
```

**See also:** `For`

---

### createRef `function`

```ts
createRef<T>(): Ref<T>
```

Create a mutable ref object (`{ current: T | null }`) for holding DOM element references. Pass as the `ref` prop on JSX elements — the runtime sets `.current` after mount and clears it on unmount. Callback refs (`(el: T | null) => void`) are also supported via `RefProp<T>`.

**Example**

```tsx
const inputRef = createRef<HTMLInputElement>()
onMount(() => inputRef.current?.focus())
return <input ref={inputRef} />
```

**See also:** `onMount`

---

### untrack `function`

```ts
(fn: () => T) => T
```

Execute a function reading signals WITHOUT subscribing to them. Alias for `runUntracked` from `@pyreon/reactivity`. Use inside effects when you need a one-shot snapshot of a signal value without the effect re-running when that signal changes.

**Example**

```tsx
effect(() => {
  const current = count()        // tracked
  const other = untrack(() => otherSignal())  // NOT tracked
})
```

**See also:** `@pyreon/reactivity`

---

### nativeCompat `function`

```ts
<T>(fn: T) => T
```

Mark a Pyreon framework component as "self-managing" so compat layers (`@pyreon/{react,preact,vue,solid}-compat`) skip their wrapping and route the component through Pyreon's mount path. Use on every `@pyreon/*` JSX component whose setup body uses `provide()` / lifecycle hooks / signal subscriptions — wrapping breaks those by running the body inside the compat layer's render context instead of Pyreon's. Idempotent; non-function inputs pass through unchanged. The marker is a registry symbol (`Symbol.for("pyreon:native-compat")`), so framework and compat sides share it without an import dependency between them.

**Example**

```tsx
// In a framework package:
export const RouterView = nativeCompat(function RouterView(props) {
  provide(RouterContext, ...)
  return <div>{children}</div>
})
```

**Common mistakes**

- Forgetting to mark a new framework JSX export — under compat mode, the component's `provide()` / `onMount()` calls fail with "called outside component setup" warnings and the rendered DOM silently breaks.
- Marking user-app components — only `@pyreon/*` framework components that already manage their own reactivity should be marked. User components in compat mode are SUPPOSED to be wrapped (that's how they get re-render-on-state-change semantics).

**See also:** `isNativeCompat` · `NATIVE_COMPAT_MARKER`

---

### isNativeCompat `function`

```ts
(fn: unknown) => boolean
```

Compat-layer-side: read whether a function has been marked as a Pyreon native framework component via `nativeCompat()`. Compat `jsx()` calls this to decide whether to skip the React/Vue/Solid/Preact-style wrapping. Always returns `false` for non-function inputs.

**Example**

```tsx
// In a compat layer's jsx-runtime:
if (isNativeCompat(type)) return h(type, props)
return wrapCompatComponent(type)(props)
```

**See also:** `nativeCompat` · `NATIVE_COMPAT_MARKER`

---

### NATIVE_COMPAT_MARKER `constant`

```ts
symbol
```

The well-known registry symbol (`Symbol.for("pyreon:native-compat")`) used to mark a component as a Pyreon native framework component. Most callers should use `nativeCompat()` / `isNativeCompat()` instead of touching the symbol directly; exported for advanced cases (e.g., a compat layer that wants to inspect the property without going through the helper).

**Example**

```tsx
import { NATIVE_COMPAT_MARKER } from '@pyreon/core'

// Equivalent to nativeCompat(MyComponent):
;(MyComponent as Record<symbol, boolean>)[NATIVE_COMPAT_MARKER] = true
```

**See also:** `nativeCompat` · `isNativeCompat`

---

### ExtractProps `type`

```ts
type ExtractProps<T> = /* matches up to 4 overloads, unions the props */ T extends ComponentFn<infer P> ? P : T
```

Extracts the props type from a `ComponentFn`. Passes through unchanged if `T` is not a `ComponentFn`. **Multi-overload aware** — matches up to 4 call signatures and produces the UNION of their first-argument types. Critical for multi-overload primitives (Iterator, List, Element) whose loosest overload is last; without overload-aware extraction, HOC wrapping (`rocketstyle()`, `attrs()`) silently downgraded their public prop surface. Single-overload functions still work — the union of 4 copies of the same props type dedupes back to the single shape.

**Example**

```tsx
function Iterator<T extends SimpleValue>(p: { data: T[]; valueName?: string }): VNodeChild
function Iterator<T extends ObjectValue>(p: { data: T[]; component: ComponentFn<T> }): VNodeChild
type Props = ExtractProps<typeof Iterator>
// → { data: SimpleValue[]; valueName?: string }
//  | { data: ObjectValue[]; component: ComponentFn<ObjectValue> }
```

**Common mistakes**

- Assuming `ExtractProps<T>` returns only the LAST overload — pre-fix it did, post-fix it returns the UNION of up to 4 overloads. Functions with more than 4 overloads still drop the extras.
- Using `T extends (props: infer P) => any ? P : never` directly in user code — that pattern captures only the LAST overload of a multi-overload function. Use `ExtractProps<T>` to get the full union.

**See also:** `HigherOrderComponent`

---

### HigherOrderComponent `type`

```ts
type HigherOrderComponent<HOP, P> = ComponentFn<HOP & P>
```

Typed HOC pattern where `HOP` is the props the HOC adds and `P` is the wrapped component's own props. The resulting component accepts both sets of props.

**Example**

```tsx
function withLogger<P>(Wrapped: ComponentFn<P>): HigherOrderComponent<{ logLevel?: string }, P> {
  return (props) => {
    console.log(`[${props.logLevel ?? "info"}] Rendering`)
    return <Wrapped {...props} />
  }
}
```

**See also:** `ExtractProps`

---

## Package-level notes

> **Components run once:** Pyreon components are plain functions that execute a single time. Reactivity comes from reading signals inside reactive scopes (JSX expression thunks, `effect()`, `computed()`), not from re-running the component function. `if (!cond()) return null` at the top level runs once and is static — use `return (() => { if (!cond()) return null; return <div /> })` for reactive conditional rendering.

> **Destructuring props kills reactivity:** `const { name } = props` captures the value at setup time — it becomes static. Use `props.name` inside reactive scopes, or `splitProps(props, ["name"])` for rest patterns. The compiler handles `const x = props.y; return <div>{x}</div>` by inlining `props.y` back at the use site, but only for `const` (not `let`/`var`).

> **Two context types:** `createContext<T>` returns `T` from `useContext()` — safe to destructure. `createReactiveContext<T>` returns `() => T` — must call to read. Using the wrong one is a common source of stale-value bugs (static context for dynamic values) or unnecessary ceremony (reactive context for constants).

> **For uses by, not key:** The `<For>` component uses the `by` prop for its key function because JSX extracts `key` as a special VNode reconciliation prop. Writing `<For each={items()} key={fn}>` silently passes the key to the VNode system instead of the list reconciler.

> **JSX uses standard HTML attributes:** Use `class` not `className`, `for` not `htmlFor`, `onInput` not `onChange` for per-keystroke updates. Pyreon maps to native DOM events, not the React synthetic event system.
