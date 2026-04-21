/**
 * Pyreon API reference database — structured documentation for every public export.
 * Used by the MCP server's get_api tool and the llms.txt generator.
 *
 * Format: "package/symbol" → { signature, example, notes?, mistakes? }
 */

export interface ApiEntry {
  signature: string
  example: string
  notes?: string
  mistakes?: string
}

export const API_REFERENCE: Record<string, ApiEntry> = {
  // ═══════════════════════════════════════════════════════════════════════════
  // @pyreon/reactivity
  // ═══════════════════════════════════════════════════════════════════════════

  // <gen-docs:api-reference:start @pyreon/reactivity>

  'reactivity/signal': {
    signature: '<T>(initialValue: T, options?: { name?: string }) => Signal<T>',
    example: `const count = signal(0)
count()              // 0 (subscribes to updates)
count.set(5)         // sets to 5
count.update(n => n + 1)  // 6
count.peek()         // 6 (does NOT subscribe)`,
    notes: 'Create a reactive signal. The returned value is a CALLABLE FUNCTION — `count()` reads (and subscribes), `count.set(v)` writes, `count.update(fn)` derives, `count.peek()` reads without subscribing. This is NOT a `.value` getter/setter pattern (React/Vue) — Pyreon signals are functions. Optional `{ name }` for debugging; auto-injected by `@pyreon/vite-plugin` in dev mode. See also: computed, effect, batch.',
    mistakes: `- \`count.value\` — does not exist. Use \`count()\` to read
- \`count = 5\` — reassigning the variable replaces the signal, does not write to it. Use \`count.set(5)\`
- \`signal(5)\` called with an argument after creation — reads and ignores the argument (dev mode warns). Use \`.set(5)\` to write
- \`const [val, setVal] = signal(0)\` — signals are not destructurable tuples. The whole return value IS the signal
- \`{count}\` in JSX — renders the signal function itself, not its value. Use \`{count()}\` or \`{() => count()}\`
- \`.peek()\` inside \`effect()\` / \`computed()\` — bypasses tracking, creates stale reads. Only use \`.peek()\` for loop-prevention guards`,
  },

  'reactivity/computed': {
    signature: '<T>(fn: () => T, options?: { equals?: (a: T, b: T) => boolean }) => Computed<T>',
    example: `const count = signal(0)
const doubled = computed(() => count() * 2)
doubled()  // 0
count.set(5)
doubled()  // 10`,
    notes: 'Create a memoized derived value. Dependencies auto-tracked on each evaluation — no dependency array needed (unlike React `useMemo`). Only recomputes when a tracked signal actually changes. Custom `equals` function prevents downstream effects from firing on structurally-equal updates (default: `Object.is`). See also: signal, effect.',
    mistakes: `- \`computed(() => count)\` — must CALL the signal: \`computed(() => count())\`
- Using \`computed()\` for side effects — use \`effect()\` instead; computed is for pure derivation
- Expecting \`computed()\` to re-run when a \`.peek()\`-read signal changes — \`.peek()\` bypasses tracking`,
  },

  'reactivity/effect': {
    signature: '(fn: () => (() => void) | void) => () => void',
    example: `const count = signal(0)
const dispose = effect(() => {
  console.log("Count:", count())
  onCleanup(() => console.log("cleaning up"))
})
// Or return cleanup directly:
effect(() => {
  const handler = () => console.log(count())
  window.addEventListener("resize", handler)
  return () => window.removeEventListener("resize", handler)
})`,
    notes: 'Run a side effect that auto-tracks signal dependencies and re-runs when they change. Returns a dispose function that unsubscribes. The effect function can return a cleanup callback (equivalent to calling `onCleanup()` inside the body) — the cleanup runs before each re-execution and on final dispose. For DOM-specific effects with lighter overhead, use `renderEffect()` instead. See also: onCleanup, computed, renderEffect.',
    mistakes: `- Passing a dependency array — Pyreon auto-tracks; no array needed
- \`effect(() => { count })\` — must call the signal: \`effect(() => { count() })\`
- Nesting \`effect()\` inside \`effect()\` — use \`computed()\` for derived values instead
- Creating signals inside an effect — they re-create on every run; create once outside`,
  },

  'reactivity/batch': {
    signature: '(fn: () => void) => void',
    example: `const a = signal(1)
const b = signal(2)
batch(() => {
  a.set(10)
  b.set(20)
})
// Effects that read both a() and b() fire once, not twice`,
    notes: 'Group multiple signal writes so subscribers fire only once — after the batch completes. Uses pointer swap (zero allocation). Essential when updating 3+ signals that downstream effects read together; without batch, each `.set()` triggers an independent notification pass. See also: signal, effect.',
    mistakes: `- Reading a signal inside \`batch()\` and expecting the NEW value before the batch completes — reads inside the batch see the new value (writes are synchronous), but effects fire only after the batch callback returns
- Forgetting \`batch()\` when updating 3+ related signals — causes N intermediate re-renders`,
  },

  'reactivity/onCleanup': {
    signature: '(fn: () => void) => void',
    example: `effect(() => {
  const handler = () => console.log(count())
  window.addEventListener("resize", handler)
  onCleanup(() => window.removeEventListener("resize", handler))
})`,
    notes: 'Register a cleanup function inside an `effect()` or `renderEffect()`. Runs before each re-execution of the effect (when dependencies change) and once on final dispose. Equivalent to returning a cleanup function from the effect body — both forms work, `onCleanup` is useful when you need to register cleanup at a different point than the end of the body. See also: effect.',
    mistakes: `- Using \`onCleanup\` outside an effect — it only works inside \`effect()\` or \`renderEffect()\` body
- Confusing with \`onUnmount\` — \`onCleanup\` is for effects, \`onUnmount\` is for component lifecycle`,
  },

  'reactivity/watch': {
    signature: '<T>(source: () => T, callback: (next: T, prev: T) => void, options?: WatchOptions) => () => void',
    example: `watch(() => count(), (next, prev) => {
  console.log(\`changed from \${prev} to \${next}\`)
})`,
    notes: 'Explicit reactive watcher — tracks `source` and fires `callback` when it changes. Unlike `effect()`, the callback receives both `next` and `prev` values and does NOT auto-track signals read inside the callback body. `source` is evaluated at setup time to establish tracking; reading browser globals there still fires SSR lint rules. Returns a dispose function. See also: effect, computed.',
    mistakes: `- Reading browser globals in the \`source\` function — it runs at setup time (not just in mounted context), so \`no-window-in-ssr\` fires on \`window.X\` there
- Expecting signals read inside the \`callback\` to be tracked — only the \`source\` function establishes tracking; the callback is untracked`,
  },

  'reactivity/createStore': {
    signature: '<T extends object>(initial: T) => T',
    example: `const store = createStore({
  todos: [{ text: 'Learn Pyreon', done: false }],
  filter: 'all',
})
store.todos[0].done = true   // fine-grained — only 'done' subscribers fire
store.todos.push({ text: 'Build app', done: false })  // array methods work`,
    notes: 'Create a deeply reactive proxy-based object. Mutations at any depth trigger fine-grained updates — `store.todos[0].done = true` only re-runs effects that read `store.todos[0].done`, not effects that read `store.todos.length` or other items. No immer, no spread-copy, no `produce()` — just mutate. Works with nested objects, arrays, Maps, and Sets. See also: signal.',
    mistakes: `- Replacing the entire store object — \`store = { ... }\` replaces the variable, not the proxy. Mutate properties instead: \`store.filter = "active"\`
- Destructuring store properties at setup — \`const { filter } = store\` captures the value once, losing reactivity. Read \`store.filter\` inside reactive scopes
- Using \`createStore\` for simple scalar state — use \`signal()\` for primitives; \`createStore\` adds proxy overhead that only pays off for nested objects`,
  },

  'reactivity/untrack': {
    signature: '(fn: () => T) => T',
    example: `effect(() => {
  const current = count()        // tracked — effect re-runs on count change
  const other = untrack(() => otherSignal())  // NOT tracked — just reads the current value
})`,
    notes: `Execute a function reading signals WITHOUT subscribing to them. Alias for \`runUntracked\`. Use inside effects when you need to read a signal's current value as a one-shot snapshot without the effect re-running when that signal changes. See also: signal, effect.`,
    mistakes: '- Using `untrack` as the default — signals should be tracked by default; `untrack` is the escape hatch for specific optimization or loop-prevention cases',
  },
  // <gen-docs:api-reference:end @pyreon/reactivity>

  // ═══════════════════════════════════════════════════════════════════════════
  // @pyreon/core
  // ═══════════════════════════════════════════════════════════════════════════

  // <gen-docs:api-reference:start @pyreon/core>

  'core/h': {
    signature: 'h<P extends Props>(type: ComponentFn<P> | string | symbol, props: P | null, ...children: VNodeChild[]): VNode',
    example: `const vnode = h("div", { class: "container" },
  h("h1", null, "Hello"),
  h(Counter, { initial: 0 })
)`,
    notes: 'Create a VNode from a component function, HTML tag string, or symbol (Fragment, Portal). Low-level API — prefer JSX which compiles to `h()` calls (or `_tpl()` + `_bind()` for template-optimized paths). Children are stored in `vnode.children`; components must merge them via `props.children = vnode.children.length === 1 ? vnode.children[0] : vnode.children`. See also: Fragment, Dynamic, lazy.',
    mistakes: `- \`h("div", "text")\` — second arg is always props (or null). Text children go in the third+ positions: \`h("div", null, "text")\`
- \`h(MyComponent, { children: <span /> })\` — children go as rest args, not a prop: \`h(MyComponent, null, <span />)\`
- \`h("input", { className: "x" })\` — use \`class\` not \`className\` (Pyreon uses standard HTML attributes)
- \`h("input", { onChange: handler })\` — use \`onInput\` for keypress-by-keypress updates (native DOM events)`,
  },

  'core/Fragment': {
    signature: 'Fragment: symbol',
    example: `// JSX:
<>
  <h1>Title</h1>
  <p>Content</p>
</>

// h() API:
h(Fragment, null, h("h1", null, "Title"), h("p", null, "Content"))`,
    notes: 'Symbol used as the type for fragment VNodes that group children without producing a wrapper DOM element. In JSX, `<>...</>` compiles to `h(Fragment, null, ...)`. Useful when a component needs to return multiple sibling elements. See also: h.',
  },

  'core/onMount': {
    signature: 'onMount(fn: () => CleanupFn | void): void',
    example: `const Timer = () => {
  const count = signal(0)

  onMount(() => {
    const id = setInterval(() => count.update(n => n + 1), 1000)
    return () => clearInterval(id)  // cleanup on unmount
  })

  return <div>{() => count()}</div>
}`,
    notes: 'Register a callback that runs after the component mounts into the DOM. The callback can optionally return a cleanup function that runs on unmount — this is the idiomatic pattern for event listeners, timers, and subscriptions. Must be called during component setup (the synchronous function body), not inside effects or async callbacks. See also: onUnmount, onUpdate.',
    mistakes: `- Forgetting cleanup: \`onMount(() => { const id = setInterval(...) })\` leaks the interval. Return cleanup: \`return () => clearInterval(id)\`
- Using \`onMount\` + separate \`onUnmount\` for paired setup/teardown — prefer returning cleanup from \`onMount\` instead
- Calling \`onMount\` inside an \`effect()\` or async callback — it only works during synchronous component setup
- Accessing DOM refs before mount — the callback runs AFTER mount, which is the right place for DOM measurements`,
  },

  'core/onUnmount': {
    signature: 'onUnmount(fn: () => void): void',
    example: `onUnmount(() => {
  console.log("Component removed from DOM")
})`,
    notes: 'Register a callback that runs when the component is removed from the DOM. For paired setup/teardown, prefer returning a cleanup function from `onMount` instead — it co-locates the cleanup with the setup. `onUnmount` is useful when cleanup needs to reference state computed separately from the mount callback. See also: onMount.',
  },

  'core/onUpdate': {
    signature: 'onUpdate(fn: () => void): void',
    example: `onUpdate(() => {
  console.log("Component updated, DOM is current")
})`,
    notes: 'Register a callback that runs after the component updates (reactive dependencies change and DOM patches complete). Rarely needed — most update logic belongs in `effect()` or `computed()`. Useful for imperative DOM measurements that need to run after all reactive updates have flushed. See also: onMount, onUnmount.',
  },

  'core/onErrorCaptured': {
    signature: 'onErrorCaptured(fn: (error: unknown) => boolean | void): void',
    example: `onErrorCaptured((error) => {
  console.error("Caught:", error)
  return false  // stop propagation
})`,
    notes: 'Register an error handler that captures errors thrown by descendant components. Return `false` to prevent the error from propagating further up the tree. Works alongside `ErrorBoundary` for programmatic error handling. See also: ErrorBoundary.',
  },

  'core/createContext': {
    signature: 'createContext<T>(defaultValue: T): Context<T>',
    example: `const ThemeCtx = createContext<"light" | "dark">("light")

// Provide:
const App = () => {
  provide(ThemeCtx, "dark")
  return <Child />
}

// Consume:
const Child = () => {
  const theme = useContext(ThemeCtx)  // "dark" — safe to destructure
  return <div class={theme}>...</div>
}`,
    notes: 'Create a static context. `useContext()` returns the value directly (`T`), so it is safe to destructure. Use this for values that do not change after being provided (theme name, locale string, config object). For values that change reactively (mode signal, locale signal), use `createReactiveContext` instead — otherwise consumers capture a stale snapshot at setup time. See also: createReactiveContext, provide, useContext.',
    mistakes: `- \`provide(ThemeCtx, () => modeSignal())\` with a static context — the consumer receives the function itself, not the signal value. Use \`createReactiveContext\` for dynamic values
- Destructuring a reactive context value: \`const { mode } = useContext(reactiveCtx)\` captures once. Keep the object reference and access lazily
- Calling \`useContext\` outside a component body — it reads from the component context stack, which only exists during setup`,
  },

  'core/createReactiveContext': {
    signature: 'createReactiveContext<T>(defaultValue: T): ReactiveContext<T>',
    example: `const ModeCtx = createReactiveContext<"light" | "dark">("light")

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
}`,
    notes: 'Create a reactive context. `useContext()` returns `() => T` — an accessor that must be called to read the current value. Use this for values that change over time (mode, locale, user). The accessor subscribes to updates when read inside reactive scopes (`effect()`, JSX thunks, `computed()`). See also: createContext, provide, useContext.',
  },

  'core/provide': {
    signature: 'provide<T>(ctx: Context<T> | ReactiveContext<T>, value: T): void',
    example: `const ThemeCtx = createContext<"light" | "dark">("light")

function App() {
  provide(ThemeCtx, "dark")
  return <Child />
}`,
    notes: 'Push a context value for all descendant components. Auto-cleans up on unmount. Must be called during component setup (synchronous function body). Preferred over manual `pushContext`/`popContext`. For reactive values, provide a getter function to a `ReactiveContext`: `provide(ModeCtx, () => modeSignal())`. See also: createContext, createReactiveContext, useContext.',
    mistakes: `- \`provide(ctx, "static")\` for a value that changes — use \`createReactiveContext\` + \`provide(ctx, () => signal())\`
- Calling \`provide\` inside \`onMount\` or \`effect\` — it must run during synchronous component setup
- Providing the same context twice in one component — the second \`provide\` shadows the first for that subtree`,
  },

  'core/useContext': {
    signature: 'useContext<T>(ctx: Context<T>): T',
    example: `const theme = useContext(ThemeContext)  // static: returns T
const getMode = useContext(ModeCtx)    // reactive: returns () => T`,
    notes: 'Read the nearest provided value for a context. For static `Context<T>`, returns `T` directly. For `ReactiveContext<T>`, returns `() => T` — must call the accessor to read. Falls back to the default value if no ancestor provides the context. See also: provide, createContext, createReactiveContext.',
  },

  'core/Show': {
    signature: '<Show when={condition} fallback={alternative}>{children}</Show>',
    example: `<Show when={isLoggedIn()} fallback={<LoginForm />}>
  <Dashboard />
</Show>`,
    notes: 'Reactive conditional rendering. Mounts children when `when` is truthy, unmounts and shows `fallback` when falsy. More efficient than ternary for signal-driven conditions because it avoids re-evaluating the entire branch expression on every signal change — `Show` only transitions between mounted/unmounted when the boolean flips. See also: Switch, Match, For.',
    mistakes: `- \`{cond() ? <A /> : <B />}\` — works but less efficient than \`<Show>\` for signal-driven conditions
- \`<Show when={items().length}>\` — works (truthy check), but be explicit: \`<Show when={items().length > 0}>\`
- \`<Show when={user}>\` without calling the signal — must call: \`<Show when={user()}>\``,
  },

  'core/Switch': {
    signature: '<Switch fallback={default}>{Match children}</Switch>',
    example: `<Switch fallback={<p>Unknown status</p>}>
  <Match when={status() === "loading"}>
    <Spinner />
  </Match>
  <Match when={status() === "error"}>
    <ErrorDisplay />
  </Match>
  <Match when={status() === "success"}>
    <Results />
  </Match>
</Switch>`,
    notes: 'Multi-branch conditional rendering. Renders the first `<Match>` child whose `when` prop is truthy. If no match, renders the `fallback`. More readable than nested `<Show>` for multi-way conditions. See also: Match, Show.',
  },

  'core/Match': {
    signature: '<Match when={condition}>{children}</Match>',
    example: `<Switch>
  <Match when={tab() === "home"}><Home /></Match>
  <Match when={tab() === "settings"}><Settings /></Match>
</Switch>`,
    notes: 'A branch inside a `<Switch>`. Renders its children when `when` is truthy and it is the first truthy `<Match>` in the parent `<Switch>`. Must be a direct child of `<Switch>`. See also: Switch, Show.',
  },

  'core/For': {
    signature: '<For each={items} by={keyFn}>{renderFn}</For>',
    example: `const items = signal([
  { id: 1, name: "Apple" },
  { id: 2, name: "Banana" },
])

<For each={items()} by={item => item.id}>
  {(item, index) => <li>{item.name}</li>}
</For>`,
    notes: 'Keyed reactive list rendering. Uses the `by` prop (not `key`) for the key function because JSX extracts `key` as a special VNode reconciliation prop. The render function receives each item and its index. Internally uses an LIS-based reconciler for minimal DOM mutations when the list changes. See also: Show, mapArray.',
    mistakes: `- \`<For each={items}>\` — must call the signal: \`<For each={items()}>\`
- \`<For each={items()} key={...}>\` — use \`by\` not \`key\` (JSX reserves \`key\` for VNode reconciliation)
- \`{items().map(...)}\` — use \`<For>\` for reactive list rendering; \`.map()\` re-creates all DOM nodes on every change
- \`<For each={items()} by={index}>\` — using array index as key defeats the reconciler; use a stable identity like \`item.id\``,
  },

  'core/Suspense': {
    signature: '<Suspense fallback={loadingUI}>{children}</Suspense>',
    example: `const LazyPage = lazy(() => import("./HeavyPage"))

<Suspense fallback={<div>Loading...</div>}>
  <LazyPage />
</Suspense>`,
    notes: 'Async boundary that shows `fallback` while any `lazy()` component or async child inside is loading. SSR mode streams the fallback immediately and swaps in the resolved content when ready (30s timeout). Nested Suspense boundaries are independent — an inner boundary resolving does not affect the outer. See also: lazy, ErrorBoundary.',
  },

  'core/ErrorBoundary': {
    signature: '<ErrorBoundary onCatch={handler} fallback={errorUI}>{children}</ErrorBoundary>',
    example: `<ErrorBoundary
  onCatch={(err) => console.error(err)}
  fallback={(err) => <div>Error: {err.message}</div>}
>
  <App />
</ErrorBoundary>`,
    notes: 'Catches render errors thrown by descendant components. The `fallback` receives the error object for display. `onCatch` fires with the error for logging/telemetry. Without an ErrorBoundary, uncaught errors propagate to the nearest `registerErrorHandler` or crash the app. See also: Suspense, onErrorCaptured.',
  },

  'core/lazy': {
    signature: 'lazy(loader: () => Promise<{ default: ComponentFn }>, options?: LazyOptions): LazyComponent',
    example: `const Settings = lazy(() => import("./pages/Settings"))

// Use in JSX (wrap with Suspense):
<Suspense fallback={<Spinner />}>
  <Settings />
</Suspense>`,
    notes: 'Wrap a dynamic import for code splitting. Returns a component that integrates with `Suspense` — the parent Suspense boundary shows its fallback until the import resolves. The loaded component is cached after first resolution. See also: Suspense, Dynamic.',
  },

  'core/Dynamic': {
    signature: '<Dynamic component={comp} {...props} />',
    example: `const components = { home: HomePage, about: AboutPage }
const current = signal("home")

<Dynamic component={components[current()]} />`,
    notes: 'Renders a component by reference or string tag name. Useful when the component to render is determined at runtime (tab panels, plugin systems, polymorphic containers). When `component` changes, the previous component unmounts and the new one mounts. See also: lazy, h.',
  },

  'core/cx': {
    signature: 'cx(...values: ClassValue[]): string',
    example: `cx("foo", "bar")                         // "foo bar"
cx("base", isActive && "active")         // conditional
cx({ base: true, active: isActive() })   // object syntax
cx(["a", ["b", { c: true }]])            // nested arrays

// class prop accepts ClassValue directly:
<div class={["base", cond && "active"]} />
<div class={{ base: true, active: isActive() }} />`,
    notes: 'Combine class values into a single string. Accepts strings, booleans (falsy values ignored), objects (`{ active: true }`), and arrays (nested). The `class` prop on JSX elements already accepts `ClassValue` directly, so explicit `cx()` is only needed when building class strings outside JSX or when composing values from multiple sources. See also: splitProps, mergeProps.',
  },

  'core/splitProps': {
    signature: 'splitProps<T, K extends keyof T>(props: T, keys: K[]): [Pick<T, K>, Omit<T, K>]',
    example: `const Button = (props: { class?: string; onClick: () => void; children: VNodeChild }) => {
  const [local, rest] = splitProps(props, ["class"])
  return <button {...rest} class={cx("btn", local.class)} />
}`,
    notes: 'Split a props object into two parts: the picked keys and the rest. Both halves preserve signal reactivity — reads through either half still track the original reactive prop getters. This is the Pyreon replacement for `const { x, ...rest } = props` destructuring, which captures values once and loses reactivity. See also: mergeProps, cx.',
    mistakes: `- \`const { class: cls, ...rest } = props\` — destructuring captures once, loses reactivity. Use \`splitProps(props, ["class"])\`
- Passing a non-props object — \`splitProps\` relies on reactive getter descriptors that the compiler creates on props objects
- Forgetting that symbol-keyed props are preserved — \`splitProps\` uses \`Reflect.ownKeys\` so symbols (like \`REACTIVE_PROP\`) survive`,
  },

  'core/mergeProps': {
    signature: 'mergeProps<T extends object[]>(...sources: T): MergedProps<T>',
    example: `const Button = (props: { size?: string; variant?: string }) => {
  const merged = mergeProps({ size: "md", variant: "primary" }, props)
  return <button class={\`btn-\${merged.size} btn-\${merged.variant}\`} />
}`,
    notes: 'Merge multiple props objects with last-source-wins semantics. Reads are lazy — the merged object delegates to the source objects via getters, so signal reactivity is preserved. Commonly used to inject default props: `mergeProps({ size: "md" }, props)`. Forces `configurable: true` on copied descriptors to prevent "Cannot redefine property" errors. See also: splitProps, cx.',
    mistakes: `- \`Object.assign({}, defaults, props)\` — loses reactivity. Use \`mergeProps(defaults, props)\` instead
- \`mergeProps(props, defaults)\` — wrong order. Defaults go FIRST, actual props last (last source wins)`,
  },

  'core/createUniqueId': {
    signature: 'createUniqueId(): string',
    example: `const LabeledInput = (props: { label: string }) => {
  const id = createUniqueId()
  return (
    <>
      <label for={id}>{props.label}</label>
      <input id={id} />
    </>
  )
}`,
    notes: 'Generate a unique string ID ("pyreon-1", "pyreon-2", ...) that is consistent between server and client when called in the same order. SSR-safe — the counter resets per request context. Use for `id`/`for`/`aria-*` attribute pairing in components. See also: splitProps.',
  },

  'core/Portal': {
    signature: '<Portal target={element}>{children}</Portal>',
    example: `<Portal target={document.body}>
  <div class="modal-overlay">
    <div class="modal">Content</div>
  </div>
</Portal>`,
    notes: 'Render children into a DOM element outside the component tree (typically `document.body`). Useful for modals, tooltips, and overlays that need to escape parent overflow/z-index stacking contexts. Context values from the Portal source tree are preserved. See also: Dynamic.',
  },

  'core/mapArray': {
    signature: 'mapArray<T, U>(list: () => T[], mapFn: (item: T, index: () => number) => U): () => U[]',
    example: `const items = signal([1, 2, 3])
const doubled = mapArray(() => items(), (item) => item * 2)
// doubled() → [2, 4, 6] — updates reactively`,
    notes: 'Low-level reactive array mapping used internally by `<For>`. Maps a reactive array signal through a transform function, caching results per item identity. Prefer `<For>` in JSX — use `mapArray` only when you need a reactive derived array outside of rendering. See also: For.',
  },

  'core/createRef': {
    signature: 'createRef<T>(): Ref<T>',
    example: `const inputRef = createRef<HTMLInputElement>()
onMount(() => inputRef.current?.focus())
return <input ref={inputRef} />`,
    notes: 'Create a mutable ref object (`{ current: T | null }`) for holding DOM element references. Pass as the `ref` prop on JSX elements — the runtime sets `.current` after mount and clears it on unmount. Callback refs (`(el: T | null) => void`) are also supported via `RefProp<T>`. See also: onMount.',
  },

  'core/untrack': {
    signature: '(fn: () => T) => T',
    example: `effect(() => {
  const current = count()        // tracked
  const other = untrack(() => otherSignal())  // NOT tracked
})`,
    notes: 'Execute a function reading signals WITHOUT subscribing to them. Alias for `runUntracked` from `@pyreon/reactivity`. Use inside effects when you need a one-shot snapshot of a signal value without the effect re-running when that signal changes. See also: @pyreon/reactivity.',
  },

  'core/ExtractProps': {
    signature: 'type ExtractProps<T> = T extends ComponentFn<infer P> ? P : T',
    example: `const Greet: ComponentFn<{ name: string }> = ({ name }) => <h1>{name}</h1>
type Props = ExtractProps<typeof Greet>  // { name: string }`,
    notes: `Extracts the props type from a \`ComponentFn\`. Passes through unchanged if \`T\` is not a \`ComponentFn\`. Useful for HOC patterns and typed wrappers that need to infer the wrapped component's prop interface. See also: HigherOrderComponent.`,
  },

  'core/HigherOrderComponent': {
    signature: 'type HigherOrderComponent<HOP, P> = ComponentFn<HOP & P>',
    example: `function withLogger<P>(Wrapped: ComponentFn<P>): HigherOrderComponent<{ logLevel?: string }, P> {
  return (props) => {
    console.log(\`[\${props.logLevel ?? "info"}] Rendering\`)
    return <Wrapped {...props} />
  }
}`,
    notes: `Typed HOC pattern where \`HOP\` is the props the HOC adds and \`P\` is the wrapped component's own props. The resulting component accepts both sets of props. See also: ExtractProps.`,
  },
  // <gen-docs:api-reference:end @pyreon/core>

  // ═══════════════════════════════════════════════════════════════════════════
  // @pyreon/router
  // ═══════════════════════════════════════════════════════════════════════════

  // <gen-docs:api-reference:start @pyreon/router>

  'router/createRouter': {
    signature: 'createRouter(options: RouterOptions | RouteRecord[]): Router',
    example: `const router = createRouter([
  { path: "/", component: Home },
  { path: "/user/:id", component: User, loader: ({ params }) => fetchUser(params.id) },
  { path: "/admin", component: Admin, beforeEnter: requireAuth, children: [
    { path: "settings", component: Settings },
  ]},
])`,
    notes: 'Create a router instance with route records, guards, middleware, and mode configuration. Accepts either an array of route records (shorthand) or a full `RouterOptions` object with `routes`, `mode` (`"history"` | `"hash"`), `scrollBehavior`, `beforeEach`, `afterEach`, and `middleware`. The returned `Router` is generic over route names for typed programmatic navigation. See also: RouterProvider, useRouter, useRoute.',
    mistakes: `- \`createRouter({ routes: [...], mode: "hash" })\` and using \`window.location.hash\` elsewhere — hash mode uses \`history.pushState\`, not \`location.hash\`. Reading \`location.hash\` directly will not reflect router state
- Defining route paths without leading \`/\` in root routes — all root-level paths must start with \`/\`
- Using \`redirect: "/target"\` with a guard on the same route — redirects bypass guards. Use \`beforeEnter\` to conditionally redirect instead
- Forgetting the catch-all route — \`{ path: "(.*)", component: NotFound }\` should be the last route to handle 404s`,
  },

  'router/RouterProvider': {
    signature: '<RouterProvider router={router}>{children}</RouterProvider>',
    example: `const App = () => (
  <RouterProvider router={router}>
    <nav><RouterLink to="/">Home</RouterLink></nav>
    <RouterView />
  </RouterProvider>
)`,
    notes: 'Provide the router instance to the component tree via `RouterContext`. Must wrap the entire app (or the routed section). Sets up the context stack so `useRouter()`, `useRoute()`, and other hooks can access the router. See also: createRouter, RouterView, RouterLink.',
  },

  'router/RouterView': {
    signature: '<RouterView />',
    example: `// Renders the matched route's component
<RouterView />

// Nested routes: parent component includes <RouterView /> for children
const Admin = () => (
  <div>
    <h1>Admin</h1>
    <RouterView />  {/* renders Settings, Users, etc. */}
  </div>
)`,
    notes: `Render the matched route's component. For nested routes, the parent route component includes a \`<RouterView />\` that renders the matched child. Each \`<RouterView>\` renders one level of the route tree. See also: RouterProvider, createRouter.`,
  },

  'router/RouterLink': {
    signature: '<RouterLink to={path} activeClass={cls} exactActiveClass={cls}>{children}</RouterLink>',
    example: `<RouterLink to="/" activeClass="nav-active">Home</RouterLink>
<RouterLink to={{ name: "user", params: { id: "42" } }}>Profile</RouterLink>`,
    notes: 'Declarative navigation link that renders an `<a>` element. Supports string paths or named route objects (`{ name, params }`). Applies `activeClass` when the current route matches the link path (prefix), and `exactActiveClass` for exact matches. Click handler calls `router.push()` and prevents default. See also: useRouter, useIsActive.',
    mistakes: `- \`<a href="/about" onClick={() => router.push("/about")}>\` — use \`<RouterLink to="/about">\` instead; it handles the anchor element, active class, and click interception
- \`<RouterLink to="/about" target="_blank">\` — external navigation bypasses the router; use a plain \`<a>\` for external links
- \`<RouterLink to={dynamicPath}>\` without calling the signal — must call: \`<RouterLink to={dynamicPath()}>\` (or let the compiler handle it via \`_rp()\`)`,
  },

  'router/useRouter': {
    signature: 'useRouter(): Router',
    example: `const router = useRouter()

router.push("/settings")
router.push({ name: "user", params: { id: "42" } })
router.replace("/login")
router.back()
router.forward()
router.go(-2)`,
    notes: 'Access the router instance for programmatic navigation. Returns the `Router` object with `push()`, `replace()`, `back()`, `forward()`, `go()`. `await router.push()` resolves after the View Transition `updateCallbackDone` (DOM commit is complete, new route state is live), NOT after the animation finishes. See also: useRoute, RouterLink, createRouter.',
    mistakes: `- \`router.push("/path")\` at the top level of a component body — this is synchronous imperative navigation during render, causing an infinite loop. Wrap in \`onMount\`, event handler, or \`effect\`
- \`await router.push("/path")\` expecting animation completion — \`push\` resolves after DOM commit (\`updateCallbackDone\`), not after View Transition animation finishes. Use the returned transition object's \`.finished\` if you need to wait for animation
- Calling \`useRouter()\` outside a \`<RouterProvider>\` — throws because no router context exists`,
  },

  'router/useRoute': {
    signature: 'useRoute<TPath extends string>(): () => ResolvedRoute<ExtractParams<TPath>>',
    example: `// Type-safe params:
const route = useRoute<"/user/:id">()
const userId = route().params.id  // string

// Access query, meta, etc:
route().query
route().meta`,
    notes: 'Access the current resolved route as a reactive accessor. Generic over the path string for typed params — `useRoute<"/user/:id">()` yields `route().params.id: string`. Returns a function (accessor) that must be called to read the current route — reads inside reactive scopes track route changes. See also: useRouter, useSearchParams, useLoaderData.',
  },

  'router/useIsActive': {
    signature: 'useIsActive(path: string, exact?: boolean): () => boolean',
    example: `const isHome = useIsActive("/")
const isAdmin = useIsActive("/admin")          // prefix match
const isExactAdmin = useIsActive("/admin", true)  // exact only

// Reactive — updates when route changes:
<a class={{ active: isAdmin() }} href="/admin">Admin</a>`,
    notes: 'Returns a reactive boolean for whether a path matches the current route. Segment-aware prefix matching: `/admin` matches `/admin/users` but NOT `/admin-panel`. Pass `exact=true` for exact-only matching. Updates reactively when the route changes. See also: useRoute, RouterLink.',
    mistakes: `- \`useIsActive("/admin")\` matching \`/admin-panel\` — this does NOT happen. Matching is segment-aware: \`/admin\` only matches paths starting with \`/admin/\` or exactly \`/admin\`
- \`if (useIsActive("/settings")())\` at component top level — the outer call returns an accessor; make sure to read it inside a reactive scope for updates
- Using \`useIsActive\` for complex route matching — it only does path prefix/exact matching. For query-param-aware or meta-aware checks, use \`useRoute()\` directly`,
  },

  'router/useTypedSearchParams': {
    signature: 'useTypedSearchParams<T>(schema: T): TypedSearchParams<T>',
    example: `const params = useTypedSearchParams({ page: "number", q: "string", active: "boolean" })
params.page()    // number (auto-coerced)
params.q()       // string
params.set({ page: 2 })  // updates URL`,
    notes: 'Type-safe search params with auto-coercion from URL strings. Schema keys define parameter names, values define types (`"string"`, `"number"`, `"boolean"`). Returns an object where each key is a reactive accessor and `.set()` updates the URL. See also: useSearchParams, useRoute.',
  },

  'router/useTransition': {
    signature: 'useTransition(): { isTransitioning: () => boolean }',
    example: `const { isTransitioning } = useTransition()

<Show when={isTransitioning()}>
  <ProgressBar />
</Show>`,
    notes: 'Reactive signal for route transition state. `isTransitioning()` is true during navigation (while guards run + loaders resolve), false when the new route is mounted. Useful for progress bars and global loading indicators. See also: useRouter, useRoute.',
  },

  'router/useMiddlewareData': {
    signature: 'useMiddlewareData<T>(): T',
    example: `// Middleware:
const authMiddleware: RouteMiddleware = async (ctx) => {
  ctx.data.user = await getUser(ctx.to)
}

// Component:
const data = useMiddlewareData<{ user: User }>()
// data.user is available`,
    notes: 'Read data set by `RouteMiddleware` in the middleware chain. Middleware functions receive `ctx` with a mutable `ctx.data` object — properties set there are available to all downstream components via this hook. See also: createRouter, useLoaderData.',
  },

  'router/useLoaderData': {
    signature: 'useLoaderData<T>(): T',
    example: `// Route: { path: "/user/:id", component: User, loader: ({ params }) => fetchUser(params.id) }

const User = () => {
  const data = useLoaderData<UserData>()
  return <div>{data.name}</div>
}`,
    notes: `Access the data returned by the current route's \`loader\` function. The loader runs before the route component mounts; its return value is cached and available synchronously via this hook. Generic over the loader return type. See also: useMiddlewareData, useRoute.`,
  },

  'router/useSearchParams': {
    signature: 'useSearchParams<T>(defaults?: T): [get: () => T, set: (updates: Partial<T>) => Promise<void>]',
    example: `const [search, setSearch] = useSearchParams({ page: "1", sort: "name" })

// Read:
search().page  // "1"

// Write:
setSearch({ page: "2" })`,
    notes: 'Access and update URL search params as a reactive tuple. Returns `[get, set]` where `get()` reads the current params and `set()` updates them via `replaceState`. For typed params with auto-coercion, prefer `useTypedSearchParams`. See also: useTypedSearchParams, useRoute.',
  },

  'router/useBlocker': {
    signature: 'useBlocker(shouldBlock: () => boolean): Blocker',
    example: `const blocker = useBlocker(() => form.isDirty())

<Show when={blocker.isBlocked()}>
  <Dialog>
    <p>Unsaved changes. Leave anyway?</p>
    <button onClick={blocker.proceed}>Leave</button>
    <button onClick={blocker.reset}>Stay</button>
  </Dialog>
</Show>`,
    notes: `Block navigation when a condition is true (e.g., unsaved form changes). Returns a \`Blocker\` object with \`proceed()\` and \`reset()\` methods. Also hooks into the browser's \`beforeunload\` event to warn on tab close. Uses a shared ref-counted listener for \`beforeunload\` — N blockers share one event handler. See also: useRouter.`,
  },

  'router/onBeforeRouteLeave': {
    signature: 'onBeforeRouteLeave(guard: NavigationGuard): void',
    example: `onBeforeRouteLeave((to, from) => {
  if (hasUnsavedChanges()) return false  // cancel navigation
})`,
    notes: 'Register a per-component navigation guard that fires when leaving the current route. Return `false` to cancel, a string path to redirect, or `undefined` to allow. Must be called during component setup. See also: onBeforeRouteUpdate, useBlocker.',
  },

  'router/onBeforeRouteUpdate': {
    signature: 'onBeforeRouteUpdate(guard: NavigationGuard): void',
    example: `onBeforeRouteUpdate((to, from) => {
  if (to.params.id === from.params.id) return  // no change
  // reload data for new ID...
})`,
    notes: 'Register a per-component navigation guard that fires when the route updates but the same component stays mounted (e.g., param change `/user/1` to `/user/2`). Same return semantics as `onBeforeRouteLeave`. See also: onBeforeRouteLeave, useRoute.',
  },
  // <gen-docs:api-reference:end @pyreon/router>

  // ═══════════════════════════════════════════════════════════════════════════
  // @pyreon/head
  // ═══════════════════════════════════════════════════════════════════════════

  'head/useHead': {
    signature: 'useHead(input: UseHeadInput | (() => UseHeadInput)): void',
    example: `// Static:
useHead({ title: "My Page", meta: [{ name: "description", content: "..." }] })

// Reactive (updates when signals change):
useHead(() => ({
  title: \`\${username()} — Profile\`,
  meta: [{ property: "og:title", content: username() }]
}))`,
  },

  'head/HeadProvider': {
    signature: '<HeadProvider>{children}</HeadProvider>',
    example: `// Client-side setup:
mount(
  <HeadProvider>
    <App />
  </HeadProvider>,
  document.getElementById("app")!
)`,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // @pyreon/server
  // ═══════════════════════════════════════════════════════════════════════════

  'server/createHandler': {
    signature: 'createHandler(options: HandlerOptions): (req: Request) => Promise<Response>',
    example: `import { createHandler } from "@pyreon/server"

export default createHandler({
  App,
  routes,
  clientEntry: "/src/entry-client.ts",
  mode: "stream",  // or "string"
})`,
  },

  'server/island': {
    signature:
      'island(loader: () => Promise<ComponentFn>, options: { name: string; hydrate?: HydrationStrategy }): ComponentFn',
    example: `const SearchBar = island(
  () => import("./SearchBar"),
  { name: "SearchBar", hydrate: "visible" }
)

// Hydration strategies: "load" | "idle" | "visible" | "media" | "never"`,
  },

  'server/prerender': {
    signature: 'prerender(options: PrerenderOptions): Promise<PrerenderResult>',
    example: `await prerender({
  handler,
  paths: ["/", "/about", "/blog/1", "/blog/2"],
  outDir: "./dist",
})`,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // @pyreon/runtime-dom
  // ═══════════════════════════════════════════════════════════════════════════

  // <gen-docs:api-reference:start @pyreon/runtime-dom>

  'runtime-dom/mount': {
    signature: 'mount(root: VNodeChild, container: Element): () => void',
    example: `import { mount } from "@pyreon/runtime-dom"

const dispose = mount(<App />, document.getElementById("app")!)

// To unmount:
dispose()`,
    notes: 'Mount a VNode tree into a container element. Clears the container first, sets up event delegation, then mounts the given child. Returns an `unmount` function that removes everything and disposes all effects. In dev mode, throws if `container` is null/undefined with an actionable error message. See also: hydrateRoot, render.',
    mistakes: `- \`createRoot(container).render(<App />)\` — Pyreon uses a single function call: \`mount(<App />, container)\`
- \`mount(<App />, document.getElementById("app"))\` without \`!\` — getElementById returns \`Element | null\`. The runtime throws in dev if null, but TypeScript needs the assertion
- \`mount(<App />, document.body)\` — mounting directly to body is discouraged; use a dedicated container element
- Forgetting to call the returned unmount function — leaks event listeners and effects. Store and call it on cleanup`,
  },

  'runtime-dom/render': {
    signature: 'render(root: VNodeChild, container: Element): () => void',
    example: `import { render } from "@pyreon/runtime-dom"
render(<App />, document.getElementById("app")!)`,
    notes: 'Alias for `mount`. Provided for API familiarity — both names point to the same function. See also: mount.',
  },

  'runtime-dom/hydrateRoot': {
    signature: 'hydrateRoot(root: VNodeChild, container: Element): () => void',
    example: `import { hydrateRoot } from "@pyreon/runtime-dom"

// Hydrate SSR-rendered HTML:
hydrateRoot(<App />, document.getElementById("app")!)`,
    notes: 'Hydrate server-rendered HTML. Walks the existing DOM and attaches reactive bindings without recreating elements. Expects the DOM to match the VNode tree structure — mismatches emit dev-mode warnings. Returns an unmount function. See also: mount, @pyreon/runtime-server.',
  },

  'runtime-dom/Transition': {
    signature: '<Transition name={name} mode={mode} onEnter={fn} onLeave={fn}>{children}</Transition>',
    example: `<Transition name="fade" mode="out-in">
  <Show when={visible()}>
    <div>Content</div>
  </Show>
</Transition>

/* CSS:
.fade-enter-active, .fade-leave-active { transition: opacity 0.3s }
.fade-enter-from, .fade-leave-to { opacity: 0 }
*/`,
    notes: 'CSS-based enter/leave animation wrapper. Applies `{name}-enter-from`, `{name}-enter-active`, `{name}-enter-to` classes on enter and the corresponding `-leave-*` classes on leave. `mode` controls sequencing: `"out-in"` waits for leave to complete before entering, `"in-out"` enters first. Has a 5-second safety timeout — if `transitionend`/`animationend` never fires, the transition completes automatically. See also: TransitionGroup, @pyreon/kinetic.',
    mistakes: `- Missing CSS classes — \`<Transition name="fade">\` does nothing without \`.fade-enter-active\` / \`.fade-leave-active\` CSS
- Wrapping multiple root elements — Transition expects a single child (or null). Multiple children cause undefined behavior
- Using \`mode="in-out"\` when you want sequential — \`"out-in"\` is almost always what you want (old leaves, then new enters)`,
  },

  'runtime-dom/TransitionGroup': {
    signature: '<TransitionGroup name={name} tag={tag}>{children}</TransitionGroup>',
    example: `<TransitionGroup name="list" tag="ul">
  <For each={items()} by={i => i.id}>
    {item => <li>{item.name}</li>}
  </For>
</TransitionGroup>

/* CSS:
.list-enter-active, .list-leave-active { transition: all 0.3s }
.list-enter-from, .list-leave-to { opacity: 0; transform: translateY(10px) }
.list-move { transition: transform 0.3s }
*/`,
    notes: 'Animate list item additions and removals with CSS transitions. Each item gets enter/leave classes on mount/unmount. The `tag` prop controls the wrapper element (defaults to a fragment). Works with `<For>` for reactive lists. Also applies `-move` classes for FLIP-animated reordering. See also: Transition, For.',
  },

  'runtime-dom/KeepAlive': {
    signature: '<KeepAlive include={pattern} exclude={pattern} max={number}>{children}</KeepAlive>',
    example: `const tab = signal<"a" | "b">("a")

<KeepAlive>
  <Show when={tab() === "a"}><ExpensiveFormA /></Show>
  <Show when={tab() === "b"}><ExpensiveFormB /></Show>
</KeepAlive>`,
    notes: 'Cache component instances across mount/unmount cycles so their state (signals, scroll position, form inputs) is preserved when they are toggled out and back in. `include`/`exclude` filter by component name. `max` limits cache size (LRU eviction). Useful for tab panels and multi-step forms. See also: Transition, Show.',
  },

  'runtime-dom/_tpl': {
    signature: '_tpl(html: string): () => DocumentFragment',
    example: `// Compiler output (not hand-written):
const _$t0 = _tpl("<div class=\"container\"><span></span></div>")`,
    notes: 'Compiler-internal: create a template factory from an HTML string. First call parses the HTML into a `<template>` element; subsequent calls use `cloneNode(true)` for zero-parse instantiation. Not intended for direct use — the JSX compiler emits `_tpl()` calls automatically. See also: _bindText, _bindDirect.',
  },

  'runtime-dom/_bindText': {
    signature: '_bindText(fn: () => string, node: Text): void',
    example: `// Compiler output for <div>{count()}</div>:
const _$t = _tpl("<div> </div>")
const _$n = _$t()
_bindText(() => count(), _$n.firstChild)`,
    notes: 'Compiler-internal: bind a reactive expression to a text node via `TextNode.data` assignment. Creates a `renderEffect` that re-runs when tracked signals change. Each text node gets its own independent binding for fine-grained reactivity. See also: _tpl, _bindDirect.',
  },

  'runtime-dom/sanitizeHtml': {
    signature: 'sanitizeHtml(html: string): string',
    example: `import { setSanitizer, sanitizeHtml } from "@pyreon/runtime-dom"
setSanitizer(DOMPurify.sanitize)
const clean = sanitizeHtml(userInput)`,
    notes: 'Sanitize an HTML string using the registered sanitizer (set via `setSanitizer()`). Falls back to the identity function if no sanitizer is registered. Used by the runtime when setting `innerHTML` on elements. See also: setSanitizer.',
  },
  // <gen-docs:api-reference:end @pyreon/runtime-dom>

  // ═══════════════════════════════════════════════════════════════════════════
  // @pyreon/store
  // ═══════════════════════════════════════════════════════════════════════════

  // <gen-docs:api-reference:start @pyreon/store>

  'store/defineStore': {
    signature: '<T extends Record<string, unknown>>(id: string, setup: () => T) => () => StoreApi<T>',
    example: `const useCounter = defineStore('counter', () => {
  const count = signal(0)
  const double = computed(() => count() * 2)
  const increment = () => count.update(n => n + 1)
  return { count, double, increment }
})

const { store, patch, subscribe, reset } = useCounter()
store.count()       // 0
store.increment()   // reactive update
patch({ count: 42 })`,
    notes: 'Define a composition-style store. The setup function runs once per store ID, returning an object whose signals become tracked state and whose functions become interceptable actions. Returns a hook function that produces a StoreApi with `.store` (user state/actions), `.patch()`, `.subscribe()`, `.onAction()`, `.reset()`, and `.dispose()`. Stores are singletons — calling the hook twice with the same ID returns the same instance. See also: StoreApi, addStorePlugin, resetStore.',
    mistakes: `- Calling \`useCounter()\` expecting a new instance — stores are singletons by ID, the setup function only runs once
- Reading \`store.count\` without calling it — signals are functions, use \`store.count()\` to read the value
- Calling \`store.count.set()\` instead of using \`patch()\` when updating multiple signals — \`patch()\` batches updates into a single notification
- Forgetting \`dispose()\` in tests — store persists in the registry across test cases, leaking state. Use \`resetStore(id)\` or \`resetAllStores()\` in test cleanup`,
  },

  'store/addStorePlugin': {
    signature: '(plugin: StorePlugin) => void',
    example: `addStorePlugin((api) => {
  api.subscribe((mutation, state) => {
    console.log(\`[\${api.id}] \${mutation.type}:\`, mutation.events)
  })
})`,
    notes: 'Register a global store plugin that runs when any store is first created. Plugin receives the full StoreApi, enabling cross-cutting concerns like logging, persistence, or devtools integration. Plugin errors are caught and logged in dev mode without breaking store creation. See also: defineStore, StoreApi.',
  },

  'store/setStoreRegistryProvider': {
    signature: '(provider: () => Map<string, StoreApi<any>>) => void',
    example: `import { setStoreRegistryProvider } from '@pyreon/store'
import { AsyncLocalStorage } from 'node:async_hooks'

const als = new AsyncLocalStorage<Map<string, any>>()
setStoreRegistryProvider(() => als.getStore() ?? new Map())`,
    notes: 'Replace the default global store registry with a provider function. Essential for concurrent SSR — pass an AsyncLocalStorage-backed provider so each request gets isolated store state instead of sharing a single global map across concurrent requests. See also: defineStore.',
    mistakes: '- Forgetting to call this on the SSR server — all concurrent requests share the same store instances, causing cross-request state leaks',
  },

  'store/resetStore': {
    signature: '(id: string) => void',
    example: `resetStore('counter') // next useCounter() call creates a fresh store`,
    notes: 'Remove a store from the registry by ID. The next call to the store hook re-runs the setup function from scratch. Useful for testing isolation and HMR. See also: resetAllStores, defineStore.',
  },

  'store/resetAllStores': {
    signature: '() => void',
    example: 'afterEach(() => resetAllStores())',
    notes: 'Clear the entire store registry. All subsequent store hook calls create fresh instances. Primary use case is test cleanup and SSR request isolation. See also: resetStore.',
  },
  // <gen-docs:api-reference:end @pyreon/store>

  // ═══════════════════════════════════════════════════════════════════════════
  // @pyreon/state-tree
  // ═══════════════════════════════════════════════════════════════════════════

  // <gen-docs:api-reference:start @pyreon/state-tree>

  'state-tree/model': {
    signature: '(definition: { state: StateShape, views?: (self: ModelSelf) => Record<string, () => any>, actions?: (self: ModelSelf) => Record<string, (...args: any[]) => any> }) => ModelDefinition',
    example: `const Counter = model({
  state: { count: 0 },
  views: (self) => ({
    doubled: () => self.count() * 2,
  }),
  actions: (self) => ({
    increment: () => self.count.update(n => n + 1),
  }),
})

const counter = Counter.create({ count: 10 })
counter.count()    // 10
counter.increment()
counter.doubled()  // 22`,
    notes: 'Define a structured reactive model. `state` declares signal-backed fields with their initial values. `views` are computed derivations. `actions` are the only way to mutate state — enabling middleware interception and patch recording. Returns a `ModelDefinition` with `.create(initial?)` for instances and `.asHook(id)` for singleton access. See also: getSnapshot, applySnapshot, onPatch, addMiddleware.',
    mistakes: `- Mutating state outside of actions — bypasses middleware and patch recording, breaks the structured contract
- Forgetting that \`self.count\` is a signal — read with \`self.count()\`, write with \`self.count.set(v)\` or \`.update(fn)\` inside actions
- Nesting plain objects in state instead of child models — plain objects are not signal-backed, changes to their properties are not reactive`,
  },

  'state-tree/getSnapshot': {
    signature: '(instance: ModelInstance) => Snapshot',
    example: 'const snap = getSnapshot(counter) // { count: 10 }',
    notes: 'Recursively serialize a model instance into a plain JSON-safe snapshot. Reads all signal values via `.peek()` to avoid tracking subscriptions. Nested models are recursively serialized. See also: applySnapshot, model.',
  },

  'state-tree/applySnapshot': {
    signature: '(instance: ModelInstance, snapshot: Snapshot) => void',
    example: 'applySnapshot(counter, { count: 0 }) // reset to zero',
    notes: `Replace a model instance's state wholesale from a snapshot. Recursively applies to nested models. Triggers patch listeners with replace operations. See also: getSnapshot, model.`,
  },

  'state-tree/onPatch': {
    signature: '(instance: ModelInstance, listener: PatchListener) => () => void',
    example: `const dispose = onPatch(counter, (patch) => {
  console.log(patch) // { op: 'replace', path: '/count', value: 11 }
})`,
    notes: 'Subscribe to JSON patches emitted by actions on a model instance. Each patch records the path, operation (add/replace/remove), and value. Returns an unsubscribe function. Pairs with `applyPatch` for undo/redo and state synchronization. See also: applyPatch, model.',
  },

  'state-tree/applyPatch': {
    signature: '(instance: ModelInstance, patch: Patch | Patch[]) => void',
    example: `applyPatch(counter, { op: 'replace', path: '/count', value: 0 })`,
    notes: 'Apply one or more JSON patches to a model instance. Accepts a single patch or an array for batch replay. Used with `onPatch` for undo/redo and state synchronization. See also: onPatch, model.',
  },

  'state-tree/addMiddleware': {
    signature: '(instance: ModelInstance, middleware: MiddlewareFn) => () => void',
    example: `addMiddleware(counter, (call, next) => {
  console.log(\`\${call.name}(\${call.args.join(', ')})\`)
  return next(call)
})`,
    notes: 'Add an action interception middleware to a model instance. The middleware receives the action call context and a `next` function — call `next(call)` to proceed or return early to block the action. Returns an unsubscribe function. See also: model.',
  },
  // <gen-docs:api-reference:end @pyreon/state-tree>

  // ═══════════════════════════════════════════════════════════════════════════
  // @pyreon/form

  // ═══════════════════════════════════════════════════════════════════════════
  // @pyreon/validation
  // ═══════════════════════════════════════════════════════════════════════════

  // <gen-docs:api-reference:start @pyreon/validation>

  'validation/zodSchema': {
    signature: '<T>(schema: ZodType<T>) => SchemaAdapter<T>',
    example: `const schema = z.object({ email: z.string().email(), age: z.number().min(18) })
const form = useForm({
  initialValues: { email: '', age: 0 },
  schema: zodSchema(schema),
  onSubmit: (values) => save(values),
})`,
    notes: 'Create a whole-form schema adapter from a Zod schema. Duck-typed against the `.safeParse()` method so it works with both Zod v3 and v4 without version checks. Pass the result to `useForm({ schema })` for automatic full-form validation on submit or blur. See also: zodField, valibotSchema, arktypeSchema.',
    mistakes: `- Passing zodSchema AND per-field validators for the same field — both run and errors may conflict
- Using zodSchema with a non-object schema (z.string()) — form schemas must validate an object shape matching initialValues`,
  },

  'validation/zodField': {
    signature: '<T>(schema: ZodType<T>) => ValidateFn<T>',
    example: `const form = useForm({
  initialValues: { username: '' },
  validators: { username: zodField(z.string().min(3).max(20)) },
  onSubmit: (values) => save(values),
})`,
    notes: `Create a per-field validator from a Zod schema. Returns a function compatible with \`useForm({ validators: { fieldName: zodField(z.string().email()) } })\`. Use when individual fields have independent validation rules that don't need cross-field context. See also: zodSchema, valibotField.`,
  },

  'validation/valibotSchema': {
    signature: '<T>(schema: ValibotSchema<T>, safeParse: SafeParseFn) => SchemaAdapter<T>',
    example: `import * as v from 'valibot'
const schema = v.object({ email: v.pipe(v.string(), v.email()) })
const form = useForm({
  initialValues: { email: '' },
  schema: valibotSchema(schema, v.safeParse),
  onSubmit: (values) => save(values),
})`,
    notes: `Create a whole-form schema adapter from a Valibot schema. Requires passing the \`safeParse\` function explicitly (Valibot uses standalone functions, not methods). This keeps the adapter independent of Valibot's internal module structure across versions. See also: valibotField, zodSchema.`,
    mistakes: '- Forgetting to pass v.safeParse as the second argument — the adapter cannot call safeParse without it since Valibot uses standalone functions',
  },

  'validation/valibotField': {
    signature: '<T>(schema: ValibotSchema<T>, safeParse: SafeParseFn) => ValidateFn<T>',
    example: 'validators: { email: valibotField(v.pipe(v.string(), v.email()), v.safeParse) }',
    notes: 'Create a per-field validator from a Valibot schema. Same standalone-function-style as valibotSchema — pass `v.safeParse` explicitly. See also: valibotSchema, zodField.',
  },

  'validation/arktypeSchema': {
    signature: '<T>(schema: ArkTypeSchema<T>) => SchemaAdapter<T>',
    example: `import { type } from 'arktype'
const schema = type({ email: 'email', age: 'number > 18' })
const form = useForm({
  initialValues: { email: '', age: 0 },
  schema: arktypeSchema(schema),
  onSubmit: (values) => save(values),
})`,
    notes: 'Create a whole-form schema adapter from an ArkType type. ArkType validation is synchronous only — async validators are not supported through this adapter. Returns errors via the ArkType `problems` array. See also: arktypeField, zodSchema.',
  },

  'validation/arktypeField': {
    signature: '<T>(schema: ArkTypeSchema<T>) => ValidateFn<T>',
    example: `validators: { age: arktypeField(type('number > 18')) }`,
    notes: 'Create a per-field validator from an ArkType type. Synchronous only, same as arktypeSchema. See also: arktypeSchema, zodField.',
  },
  // <gen-docs:api-reference:end @pyreon/validation>
  // ═══════════════════════════════════════════════════════════════════════════

  // <gen-docs:api-reference:start @pyreon/form>

  'form/useForm': {
    signature: '<TValues extends Record<string, unknown>>(options: UseFormOptions<TValues>) => FormState<TValues>',
    example: `const form = useForm({
  initialValues: { email: '', password: '' },
  validators: {
    email: (v) => (!v ? 'Required' : undefined),
    password: (v, all) => (v.length < 8 ? 'Too short' : undefined),
  },
  onSubmit: async (values) => { await login(values) },
})

// Bind inputs with register():
// h('input', form.register('email'))
// h('input', { type: 'checkbox', ...form.register('remember', { type: 'checkbox' }) })`,
    notes: `Create a signal-based form. \`initialValues\` drives field keys and types end-to-end — TValues is inferred from it, so all downstream typings (\`useField\` field name, \`useWatch\` keys, validator signatures) are fully typed without annotation. Returns \`FormState<TValues>\` with per-field signals, form-level signals (\`isSubmitting\`, \`isValidating\`, \`isValid\`, \`isDirty\`, \`submitCount\`, \`submitError\`), and handlers (\`handleSubmit\`, \`reset\`, \`validate\`). \`validateOn\` defaults to \`"blur"\` (not \`"change"\`) so users aren't scolded mid-keystroke; optional \`schema\` integrates with \`@pyreon/validation\` adapters (\`zodSchema\`, \`valibotSchema\`, \`arktypeSchema\`) for whole-form validation after per-field validators run. See also: useField, FormProvider, useFormState.`,
    mistakes: `- Mutating \`initialValues\` after creation — it is read once at setup; use \`setFieldValue\` for programmatic updates
- Reading \`form.fields[name].value\` as a plain value — it is \`Signal<T>\`, call it: \`form.fields.email.value()\`
- Passing \`validateOn: "change"\` without \`debounceMs\` on async validators — fires a network request on every keystroke
- Calling \`form.handleSubmit()\` without attaching it as a form \`onSubmit\` handler — it calls \`preventDefault()\` so it must receive the form event, or be called with no argument for programmatic submit
- Forgetting that \`schema\` runs AFTER per-field \`validators\` — errors from both sources merge; if a field validator already set an error, the schema can override it`,
  },

  'form/useField': {
    signature: '<TValues, K extends keyof TValues & string>(form: FormState<TValues>, name: K) => UseFieldResult<TValues[K]>',
    example: `function EmailField({ form }: { form: FormState<{ email: string }> }) {
  const field = useField(form, 'email')
  return (
    <>
      <input {...field.register()} />
      {() => field.showError() && <span>{field.error()}</span>}
    </>
  )
}`,
    notes: `Extract a single field's state and helpers from a form instance — avoids passing the entire \`FormState\` to leaf components. Returns all \`FieldState\` signals (\`value\`, \`error\`, \`touched\`, \`dirty\`) plus two convenience computeds: \`hasError\` (true when an error string exists) and \`showError\` (true when touched AND errored — the typical UI condition for gating error display). Also exposes \`register(opts?)\` to bind an \`<input>\` element with a single spread. See also: useForm, useWatch.`,
    mistakes: `- Destructuring \`const { value } = useField(form, "email")\` and calling \`value()\` — works, but the getter evaluates to the Signal itself; storing \`value()\` at setup captures the initial value and defeats reactivity
- Forgetting \`showError\` and reimplementing \`touched() && hasError()\` in every template — \`showError\` is a \`Computed<boolean>\`, use it directly`,
  },

  'form/useFieldArray': {
    signature: '<T>(initial?: T[]) => UseFieldArrayResult<T>',
    example: `const tags = useFieldArray<string>([])
tags.append('typescript')
tags.prepend('signals')
tags.insert(1, 'reactive')
tags.move(0, 2)
tags.remove(0)

// Keyed rendering — never drop the \`by={i => i.key}\`
<For each={tags.items()} by={(i) => i.key}>
  {(item) => <input value={item.value()} onInput={(e) => item.value.set(e.currentTarget.value)} />}
</For>`,
    notes: 'Manage a dynamic array of form fields with stable keys. Each item is `{ key: number, value: Signal<T> }` — use `item.key` inside `<For by={i => i.key}>` so reordering / inserts do not remount child components. Full mutation surface: `append`, `prepend`, `insert`, `remove`, `update`, `move`, `swap`, `replace`. See also: useForm.',
    mistakes: `- Rendering with <For by={(_, i) => i}> — index-based keys lose identity on reorder, defeating the stable-key design
- Calling tags.items() inside setup and storing the array — it is a Signal, read inside reactive scopes`,
  },

  'form/useWatch': {
    signature: '(form, name) => Signal<TValues[K]> | (form, names[]) => Signal<T>[] | (form) => Computed<TValues>',
    example: `const email = useWatch(form, 'email')            // Signal<string>
const [first, last] = useWatch(form, ['firstName', 'lastName'])
const everything = useWatch(form)                 // Computed<TValues>

// Derive and sync: preview displays the email as the user types.
effect(() => { preview.set(\`Hello \${email()}\`) })`,
    notes: 'Typed overloads for reactively watching form field values. Single-field form returns `Signal<T>` (fast path — same signal, no wrapper), multi-field returns a tuple of signals, no-args returns a `Computed<TValues>` over the whole values object. Prefer the narrowest form — watching everything re-runs your effect when ANY field changes. See also: useFormState, useField.',
    mistakes: '- Using the all-fields overload (`useWatch(form)`) to derive a single computed — re-runs when any field changes, not just the one you care about. Use `useWatch(form, "email")` for single-field precision',
  },

  'form/useFormState': {
    signature: '<TValues, T>(form: FormState<TValues>, selector?: (s: FormStateSummary) => T) => Computed<T>',
    example: `const canSubmit = useFormState(form, (s) => s.isValid && !s.isSubmitting && s.isDirty)
<button disabled={() => !canSubmit()}>Save</button>`,
    notes: 'Computed summary of form-level state (`isValid`, `isDirty`, `isSubmitting`, `isValidating`, `submitCount`, `errors`). Passing a selector restricts the tracked subset — a button driven by `canSubmit` should not re-render just because `submitCount` changed. Without a selector, the computed re-derives on ANY form-level state change. See also: useForm, useWatch.',
    mistakes: '- Omitting the selector and reading `useFormState(form)` as a whole — triggers on every field change, every validation, every submit count bump. Always pass a selector for UI-bound computeds',
  },

  'form/FormProvider': {
    signature: '<TValues>(props: { form: FormState<TValues>; children: VNodeChild }) => VNode',
    example: `<FormProvider form={form}>
  <PersonalInfoSection />
  <AddressSection />
  <SubmitButton />
</FormProvider>

// Inside any descendant:
const form = useFormContext<typeof values>()`,
    notes: 'Provide a form via context so nested components can read it with `useFormContext<TValues>()` without prop-drilling. Every call to `useFormContext` inside the provider tree returns the same `FormState` instance. Nest inside `PyreonUI` or any other provider — the form context is independent. See also: useFormContext, useForm.',
    mistakes: '- Nesting `FormProvider` within itself expecting scoped forms — the inner provider shadows the outer; for multi-form pages, use separate providers at sibling level, not nested',
  },

  'form/useFormContext': {
    signature: '<TValues>() => FormState<TValues>',
    example: `const form = useFormContext<{ email: string; password: string }>()
const field = useField(form, 'email')`,
    notes: 'Read the nearest `FormProvider` form from context. Throws at dev time if no provider is mounted above the call site. Pass the expected `TValues` generic so downstream typings (`useField` field names, `useWatch` keys) stay end-to-end typed. Returns the same `FormState<TValues>` instance that was passed to `FormProvider`. See also: FormProvider, useForm.',
    mistakes: `- Calling at module scope — hooks require an active component setup context; call inside a component body
- Omitting the \`<TValues>\` generic — TypeScript infers \`FormState<Record<string, unknown>>\` and \`useField\` field names lose type narrowing`,
  },
  // <gen-docs:api-reference:end @pyreon/form>

  // ═══════════════════════════════════════════════════════════════════════════
  // @pyreon/query
  // ═══════════════════════════════════════════════════════════════════════════

  // <gen-docs:api-reference:start @pyreon/query>

  'query/QueryClientProvider': {
    signature: '(props: { client: QueryClient; children: VNodeChild }) => VNode',
    example: `const client = new QueryClient()
<QueryClientProvider client={client}>
  <App />
</QueryClientProvider>`,
    notes: 'Mounts a `QueryClient` at the root of the component tree via context so every descendant hook (`useQuery`, `useMutation`, `useSubscription`, `useSSE`, etc.) can reach it via `useQueryClient()`. Must wrap the app — omitting it causes a runtime throw on the first hook call. One provider per app; nested providers are not supported (the deepest one wins, silently shadowing the outer). See also: useQueryClient, QueryClient.',
    mistakes: `- Forgetting to wrap the app — every query/mutation hook throws "No QueryClient set" at runtime
- Creating the \`QueryClient\` inside a component body — it re-creates on every render. Hoist to module scope or use \`useMemo\`-equivalent (\`const client = useMemo(() => new QueryClient())\`)
- Nesting providers expecting scoped caches — only one provider is supported; the deepest one wins silently`,
  },

  'query/useQuery': {
    signature: '<TData, TError, TKey>(options: () => QueryObserverOptions<...>) => UseQueryResult<TData, TError>',
    example: `const userId = signal(1)
const user = useQuery(() => ({
  queryKey: ['user', userId()],
  queryFn: () => fetch(\`/api/users/\${userId()}\`).then((r) => r.json()),
}))
// user.data(), user.error(), user.isFetching() — each its own signal`,
    notes: `Subscribe to a query with fine-grained reactive signals. \`options\` is a FUNCTION (not an object) so it can read Pyreon signals — when a tracked signal inside changes (e.g. a reactive queryKey), the observer re-evaluates options and refetches automatically. Returns one independent \`Signal<T>\` per observer field (\`data\`, \`error\`, \`status\`, \`isPending\`, \`isLoading\`, \`isFetching\`, \`isError\`, \`isSuccess\`) so templates only re-run for the exact fields they read. Internally wraps TanStack's \`QueryObserver\` and subscribes via \`onUnmount\`-guarded effect — the observer unsubscribes when the component unmounts. See also: useQueryClient, useMutation, useSuspenseQuery.`,
    mistakes: `- Passing the options object directly instead of a function — loses reactive queryKey support; the observer never re-evaluates when signals change
- Reading \`.data\` / \`.error\` / \`.isFetching\` as plain values — they are \`Signal<T>\`, call them: \`user.data()\`, \`user.isFetching()\`
- Destructuring \`const { data } = useQuery(...)\` at setup and reading \`data\` later — captures the Signal reference once, which is fine, but storing \`data()\` at setup captures the initial VALUE and defeats reactivity
- Returning \`user.data()\` at the top of a component body instead of inside a reactive accessor — components run once; read signals inside \`() => user.data()?.name\` or effects
- Expecting refetch on \`queryFn\` closure changes alone — only signals read inside the options function trigger re-evaluation; a closure capture of a \`let\` variable does not`,
  },

  'query/useMutation': {
    signature: '<TData, TError, TVars, TCtx>(options: MutationObserverOptions<...>) => UseMutationResult<TData, TError, TVars, TCtx>',
    example: `const create = useMutation({
  mutationFn: (input) => fetch('/api/posts', { method: 'POST', body: JSON.stringify(input) }).then(r => r.json()),
  onSuccess: () => client.invalidateQueries({ queryKey: ['posts'] }),
})
// <button onClick={() => create.mutate({ title: 'New' })}>Create</button>`,
    notes: 'Run a mutation (create / update / delete). Returns reactive `pending` / `success` / `error` signals plus two firing modes: `mutate(vars)` (fire-and-forget — errors go to the `error` signal) and `mutateAsync(vars)` (returns a promise for try/catch). `reset()` returns state to idle. Unlike `useQuery`, options is a plain OBJECT (not a function) because mutations are imperative — there are no reactive queryKeys to re-evaluate, so the function-wrapper overhead would add no value. `onSuccess` / `onError` / `onSettled` callbacks fire synchronously after the mutation resolves, useful for cache invalidation (`client.invalidateQueries`). See also: useQuery, useIsMutating.',
    mistakes: `- \`mutate()\` swallows errors into the \`error\` signal — use \`mutateAsync()\` with try/catch if you need programmatic error handling
- Calling \`mutate()\` inside a \`useQuery\` \`queryFn\` — mutations are imperative user actions, not data-fetching side effects; this causes infinite loops if the mutation invalidates the query that spawned it
- Reading \`mutation.data()\` outside a reactive scope — same rule as \`useQuery\`: read inside \`() => mutation.data()\` or effects`,
  },

  'query/useInfiniteQuery': {
    signature: '<TQueryFnData, TError>(options: () => InfiniteQueryObserverOptions<...>) => UseInfiniteQueryResult<TQueryFnData, TError>',
    example: `const feed = useInfiniteQuery(() => ({
  queryKey: ['feed'],
  queryFn: ({ pageParam }) => fetchPage(pageParam),
  initialPageParam: 0,
  getNextPageParam: (last) => last.nextCursor,
}))`,
    notes: 'Paginated / cursor-based query. Returns reactive `data` (wrapping `InfiniteData<T>` with `.pages` + `.pageParams`), `hasNextPage` / `hasPreviousPage` booleans, and `fetchNextPage` / `fetchPreviousPage` trigger functions. Options is a function (same reactive-tracking contract as `useQuery`). `getNextPageParam` / `getPreviousPageParam` drive cursor progression — return `undefined` to signal the end. See also: useQuery, useSuspenseInfiniteQuery.',
    mistakes: `- Forgetting \`initialPageParam\` — required by TanStack v5; omitting it throws at the first \`queryFn\` call
- Using \`data().pages\` without flattening — \`pages\` is an array of page results; most UIs want \`data().pages.flat()\` or \`data().pages.flatMap(p => p.items)\``,
  },

  'query/useQueries': {
    signature: '(queries: () => UseQueriesOptions[]) => Signal<QueryObserverResult[]>',
    example: `const results = useQueries(() =>
  userIds().map((id) => ({ queryKey: ['user', id], queryFn: () => fetchUser(id) })),
)
// results() is QueryObserverResult[] — one entry per input query`,
    notes: 'Subscribe to multiple queries in parallel. Returns a `Signal<QueryObserverResult[]>` — one entry per input query. Options is a function so the query list can depend on signals (e.g. derive one query per item in a reactive array). Each inner query independently tracks its own `data` / `error` / `isFetching` — the outer signal fires when ANY inner query updates. See also: useQuery.',
    mistakes: `- Expecting per-query fine-grained signals — \`useQueries\` returns a single combined signal, not individual \`UseQueryResult\` objects. For independent per-query tracking, call \`useQuery\` N times
- Passing a static array instead of a function — loses reactive query-list tracking; if the list of IDs changes (e.g. \`userIds()\` is a signal), the queries won't re-evaluate. Always wrap: \`useQueries(() => ids().map(...))\``,
  },

  'query/useSubscription': {
    signature: '(options: UseSubscriptionOptions) => UseSubscriptionResult',
    example: `const sub = useSubscription({
  url: 'wss://api.example.com/feed',
  onMessage: (event, client) => {
    if (JSON.parse(event.data).type === 'post-created') {
      client.invalidateQueries({ queryKey: ['posts'] })
    }
  },
})
// sub.status() — 'connecting' | 'connected' | 'disconnected' | 'error'
// sub.send(data), sub.close(), sub.reconnect()`,
    notes: 'Reactive WebSocket with auto-reconnect and QueryClient cache integration. `onMessage` receives the active `QueryClient` so push updates can invalidate or directly patch cached queries in a single line. Exponential backoff on reconnect (default 1s doubling, max 10 attempts — configurable via `reconnectDelay` / `maxReconnectAttempts`). `url` and `enabled` may be signals for reactive connection management — changing the URL closes the old socket and opens a new one. Returns `status` (signal), `send(data)`, `close()`, `reconnect()`. See also: useSSE, useQuery.',
    mistakes: `- \`onMessage\` runs on every frame the socket receives — debounce cache invalidations for high-frequency streams or you'll trigger N refetches per second
- Storing data in a parallel signal instead of using \`queryClient.setQueryData\` inside \`onMessage\` — defeats the QueryClient cache; use \`setQueryData\` to push updates into the same cache that \`useQuery\` reads
- Forgetting \`enabled: false\` on unmount-sensitive connections — the WebSocket stays open unless \`enabled\` is a signal that tracks component lifecycle or a reactive condition`,
  },

  'query/useSSE': {
    signature: '<T>(options: UseSSEOptions<T>) => UseSSEResult<T>',
    example: `const sse = useSSE({
  url: '/api/events',
  parse: JSON.parse,
  onMessage: (data, queryClient) => {
    if (data.type === 'order-updated') {
      queryClient.invalidateQueries({ queryKey: ['orders'] })
    }
  },
})
// sse.data() — last parsed message
// sse.status() — 'connecting' | 'connected' | 'disconnected' | 'error'
// sse.lastEventId(), sse.readyState(), sse.close(), sse.reconnect()`,
    notes: 'Reactive Server-Sent Events hook with QueryClient cache integration. Same pattern as `useSubscription` but read-only (no `send`). `parse` deserializes raw event data per message (e.g. `JSON.parse`); `events` filters named SSE event types (defaults to generic `message` events). Honours the SSE spec `id` field via `lastEventId()` so the browser includes `Last-Event-ID` on reconnect and the server can resume from the right offset. `onMessage` receives the `QueryClient` for cache invalidation. See also: useSubscription.',
    mistakes: `- Passing \`queryKey\` (TanStack v4 pattern) instead of using \`onMessage\` for cache integration — Pyreon's \`useSSE\` does NOT auto-update query cache; use \`queryClient.setQueryData\` or \`invalidateQueries\` inside \`onMessage\`
- Omitting \`parse\` and expecting typed data — without \`parse\`, \`data()\` is \`string\` (raw event payload); pass \`parse: JSON.parse\` for auto-deserialization`,
  },

  'query/useSuspenseQuery': {
    signature: '<TData, TError>(options: () => QueryObserverOptions<...>) => UseSuspenseQueryResult<TData, TError>',
    example: `const user = useSuspenseQuery(() => ({ queryKey: ['user', id()], queryFn: fetchUser }))

<QuerySuspense query={user} fallback={<Spinner />}>
  {() => <UserCard name={user.data().name} />}
</QuerySuspense>`,
    notes: 'Like `useQuery` but `data` is narrowed to `Signal<TData>` (never undefined). Designed for use inside a `QuerySuspense` boundary that guarantees children only render after the query succeeds — read `user.data().name` unconditionally, no `undefined` guard needed. The Suspense-mode observer fires a background refetch but never transitions `data` back to `undefined` (the previous data is retained as placeholder). `useSuspenseInfiniteQuery` is the equivalent for paginated queries. See also: QuerySuspense, useSuspenseInfiniteQuery, useQuery.',
    mistakes: `- Using \`useSuspenseQuery\` without a \`QuerySuspense\` wrapper — the narrowed type assumes a boundary guarantees data; without it, \`data()\` CAN be the initial value during the first render cycle
- Mixing \`useSuspenseQuery\` and \`useQuery\` for the same \`queryKey\` — the Suspense observer and the regular observer can race; use one or the other per key`,
  },

  'query/useSuspenseInfiniteQuery': {
    signature: '<TQueryFnData, TError>(options: () => InfiniteQueryObserverOptions<...>) => UseSuspenseInfiniteQueryResult<TQueryFnData, TError>',
    example: `const feed = useSuspenseInfiniteQuery(() => ({
  queryKey: ['feed'],
  queryFn: ({ pageParam }) => fetchPage(pageParam),
  initialPageParam: 0,
  getNextPageParam: (last) => last.nextCursor,
}))

<QuerySuspense query={feed} fallback={<Spinner />}>
  {() => <Feed pages={feed.data().pages} onMore={feed.fetchNextPage} />}
</QuerySuspense>`,
    notes: 'Like `useInfiniteQuery` but `data` is narrowed to `Signal<InfiniteData<TQueryFnData>>` (never undefined) — for use inside a `QuerySuspense` boundary. Returns the same `fetchNextPage` / `fetchPreviousPage` / `hasNextPage` / `hasPreviousPage` surface as `useInfiniteQuery`. Same caveats as `useSuspenseQuery` regarding Suspense boundary requirement. See also: useSuspenseQuery, useInfiniteQuery, QuerySuspense.',
    mistakes: `- Using without a \`QuerySuspense\` wrapper — same boundary-requirement as \`useSuspenseQuery\`; the narrowed type assumes success, but \`data()\` CAN be the initial value during the first render cycle without a boundary
- Mixing \`useSuspenseInfiniteQuery\` and \`useInfiniteQuery\` for the same \`queryKey\` — the Suspense observer and the regular observer can race; use one or the other per key`,
  },

  'query/QuerySuspense': {
    signature: '(props: QuerySuspenseProps) => VNodeChild',
    example: `<QuerySuspense
  query={[userQuery, postsQuery]}
  fallback={<Spinner />}
  error={(err) => <ErrorCard message={String(err)} />}
>
  {() => <Dashboard user={userQuery.data()} posts={postsQuery.data()} />}
</QuerySuspense>`,
    notes: 'Pyreon-native Suspense boundary for queries — replaces `<Suspense>` for the query use case with explicit error handling. Shows `fallback` while any query is `isPending`. On error, renders the `error` callback or re-throws to the nearest `ErrorBoundary`. Accepts a single query or an array — pass an array to gate on multiple queries in parallel. Children are a function (`{() => <UI />}`) so they only execute after all queries succeed. See also: useSuspenseQuery, useSuspenseInfiniteQuery.',
    mistakes: `- Passing children as plain JSX (\`<QuerySuspense query={q}><Data /></QuerySuspense>\`) instead of a function — plain children evaluate eagerly, defeating the Suspense gate. Always wrap: \`{() => <Data />}\`
- Omitting the \`error\` callback — errors re-throw to the nearest \`ErrorBoundary\`, which may not exist or may be too far up the tree. Provide an explicit \`error\` fallback for precise error handling`,
  },

  'query/useIsFetching': {
    signature: '(filters?: QueryFilters) => Signal<number>',
    example: `const fetching = useIsFetching()
// <TopSpinner visible={() => fetching() > 0} />`,
    notes: 'Global reactive count of currently-fetching queries. Pass `QueryFilters` to narrow by `queryKey` prefix, `stale` status, or `fetchStatus`. Pair with `useIsMutating` to drive a top-of-page progress bar that aggregates ALL in-flight data fetching without tracking individual queries. Returns `Signal<number>` — zero when idle. See also: useIsMutating.',
  },

  'query/useIsMutating': {
    signature: '(filters?: MutationFilters) => Signal<number>',
    example: `const mutating = useIsMutating()
// <Banner visible={() => mutating() > 0}>Saving…</Banner>`,
    notes: 'Global reactive count of currently-running mutations (optionally filtered by `MutationFilters`). Same pattern as `useIsFetching` but for the mutation pipeline. Returns `Signal<number>` — zero when no mutations are in flight. See also: useIsFetching.',
  },

  'query/QueryErrorResetBoundary': {
    signature: '(props: QueryErrorResetBoundaryProps) => VNodeChild',
    example: `<QueryErrorResetBoundary>
  {(reset) => (
    <ErrorBoundary fallback={(err, retry) => <button onClick={() => { reset(); retry() }}>Retry</button>}>
      <QuerySuspense query={q}>{() => <Data />}</QuerySuspense>
    </ErrorBoundary>
  )}
</QueryErrorResetBoundary>`,
    notes: 'Resets errored queries inside its subtree when a sibling `ErrorBoundary` recovers. Wrap around a `QuerySuspense` + `ErrorBoundary` pair to get clean retry semantics — without this, a recovered `ErrorBoundary` re-renders children but the queries still hold their error state, so the boundary immediately catches the same error again (infinite error loop). Accepts a render function child `{(reset) => ...}` so the reset action can be wired to a retry button. See also: QuerySuspense.',
  },

  'query/useQueryErrorResetBoundary': {
    signature: '() => { reset: () => void }',
    example: `const { reset } = useQueryErrorResetBoundary()
// Inside an ErrorBoundary fallback:
<button onClick={() => { reset(); retry() }}>Try again</button>`,
    notes: `Imperative access to the nearest \`QueryErrorResetBoundary\`. Returns \`{ reset }\` — call \`reset()\` to clear errored queries in the subtree. Useful when an error fallback has its own retry button outside the render-prop form of \`QueryErrorResetBoundary\`, e.g. inside a standalone \`ErrorBoundary\` fallback component that isn't a direct child of the boundary. See also: QueryErrorResetBoundary.`,
  },

  'query/useQueryClient': {
    signature: '() => QueryClient',
    example: `const client = useQueryClient()
client.invalidateQueries({ queryKey: ['posts'] })
await client.prefetchQuery({ queryKey: ['user', 1], queryFn: fetchUser })`,
    notes: 'Access the nearest `QueryClient` from context. Used to invalidate queries (`client.invalidateQueries`), prefetch data (`client.prefetchQuery`), read/write cache (`getQueryData` / `setQueryData`), or cancel queries. Throws "[Pyreon] No QueryClient set" if no `QueryClientProvider` is mounted above the call site. Returns the same `QueryClient` instance that TanStack core exposes — all TanStack methods work. See also: QueryClientProvider.',
    mistakes: '- Calling `useQueryClient()` at module scope — hooks require an active component setup context; hoist into the component body or pass the client as a function parameter',
  },

  'query/TanStack core re-exports': {
    signature: `import { QueryClient, QueryCache, MutationCache, dehydrate, hydrate, keepPreviousData, hashKey, isCancelledError, CancelledError, defaultShouldDehydrateQuery, defaultShouldDehydrateMutation } from '@pyreon/query'`,
    example: `// SSR dehydration round-trip:
import { QueryClient, dehydrate, hydrate } from '@pyreon/query'

const server = new QueryClient()
await server.prefetchQuery({ queryKey: ['users'], queryFn: fetchUsers })
const snapshot = dehydrate(server)

const client = new QueryClient()
hydrate(client, snapshot)`,
    notes: '`@pyreon/query` re-exports the framework-agnostic TanStack surface so consumers import every primitive from one entry: `QueryClient` / `QueryCache` / `MutationCache` (instance classes), `dehydrate` / `hydrate` (SSR serialization), `keepPreviousData` (placeholder helper), `hashKey` / `isCancelledError` / `CancelledError`, and the `defaultShouldDehydrate*` predicates. Types (`QueryKey`, `QueryFilters`, `MutationFilters`, `DehydratedState`, `FetchQueryOptions`, `InvalidateQueryFilters`, `InvalidateOptions`, `RefetchQueryFilters`, `RefetchOptions`, `QueryClientConfig`) re-export alongside the runtime values. See also: QueryClientProvider, useQueryClient.',
  },
  // <gen-docs:api-reference:end @pyreon/query>

  // ═══════════════════════════════════════════════════════════════════════════
  // @pyreon/hooks
  // ═══════════════════════════════════════════════════════════════════════════

  // <gen-docs:api-reference:start @pyreon/hooks>

  'hooks/useControllableState': {
    signature: '<T>(opts: { value?: () => T | undefined; defaultValue: () => T; onChange?: (v: T) => void }) => [Signal<T>, (v: T) => void]',
    example: `function MyToggle(props: { checked?: boolean; defaultChecked?: boolean; onChange?: (v: boolean) => void }) {
  const [checked, setChecked] = useControllableState({
    value: () => props.checked,
    defaultValue: () => props.defaultChecked ?? false,
    onChange: props.onChange,
  })
  return <button onClick={() => setChecked(!checked())}>{() => checked() ? 'on' : 'off'}</button>
}`,
    notes: 'Canonical controlled/uncontrolled state pattern. Returns a `[value, setValue]` tuple where the setter respects controlled mode (calls `onChange` only if controlled, mutates internal signal if uncontrolled). Used by every primitive in `@pyreon/ui-primitives`. Never reimplement the `isControlled + signal + getter` shape by hand. `value` and `defaultValue` are FUNCTIONS so signal reads track reactively — passing a plain value loses controlled/uncontrolled detection on prop changes. See also: useToggle, usePrevious.',
    mistakes: `- Passing \`value: props.checked\` (not a function) — loses reactivity on prop changes
- Mutating the returned signal directly with \`.set()\` instead of using the returned setter — bypasses the controlled-mode check`,
  },

  'hooks/useEventListener': {
    signature: '(target: EventTarget | (() => EventTarget | null), event: string, handler: EventListener, options?: AddEventListenerOptions) => void',
    example: `useEventListener(window, 'resize', () => layoutSig.set(measure()))
useEventListener(() => panelRef(), 'keydown', (e) => {
  if (e.key === 'Escape') setOpen(false)
})`,
    notes: `Register a DOM event listener with automatic cleanup on unmount. Use this instead of raw \`addEventListener\` in primitives — never \`addEventListener\` / \`removeEventListener\` directly in component code (the cleanup is the hook's whole job). \`target\` may be a getter so reactive refs (\`() => buttonRef()\`) re-bind when the underlying element changes. See also: useClickOutside, useKeyboard.`,
    mistakes: `- Using raw \`addEventListener\` instead of \`useEventListener\` — you lose automatic \`onUnmount\` cleanup
- Passing a static \`window\` / \`document\` when the target might not exist on SSR — \`useEventListener\` handles SSR-safe registration internally, but the target must be resolvable at \`onMount\` time`,
  },

  'hooks/useClickOutside': {
    signature: '(ref: () => HTMLElement | null, handler: (e: MouseEvent) => void) => void',
    example: 'useClickOutside(() => panelRef(), () => setOpen(false))',
    notes: 'Fire a callback when the user clicks outside the referenced element. Foundation for click-to-dismiss popovers, dropdowns, modals. Pair with `useFocusTrap` + `useScrollLock` for the full modal package. See also: useFocusTrap, useScrollLock, useDialog.',
    mistakes: '- Attaching to a ref that encompasses the entire viewport — every click anywhere except the ref itself triggers the handler; use a more specific ref (the popover panel, not the whole page)',
  },

  'hooks/useElementSize': {
    signature: '(ref: () => HTMLElement | null) => Signal<{ width: number; height: number }>',
    example: `const size = useElementSize(() => boxRef())
effect(() => console.log('Box is', size().width, 'x', size().height))`,
    notes: 'Reactive element size via `ResizeObserver`. Returns `Signal<{ width, height }>` that updates whenever the observed element resizes. SSR-safe (returns `{ width: 0, height: 0 }` until mount). See also: useWindowResize, useRootSize.',
  },

  'hooks/useFocusTrap': {
    signature: '(ref: () => HTMLElement | null, active: () => boolean) => void',
    example: `const isOpen = signal(false)
useFocusTrap(() => modalRef(), () => isOpen())
useScrollLock(() => isOpen())`,
    notes: 'Trap Tab/Shift+Tab focus inside the referenced element while `active()` is true. Required for modals / drawers / fullscreen overlays to be keyboard-accessible. Returns focus to the previously-focused element on deactivation. See also: useScrollLock, useDialog, useClickOutside.',
    mistakes: `- Forgetting the second argument \`active\` — always pass a reactive boolean (\`() => isOpen()\`) so the trap deactivates when the modal closes; a static \`true\` traps focus forever
- Using on an element that isn't rendered yet — the ref getter must return the element at the time \`active\` becomes true; pair with a \`<Show>\` or reactive accessor that mounts the element first`,
  },

  'hooks/useBreakpoint': {
    signature: '() => Signal<{ xs: boolean; sm: boolean; md: boolean; lg: boolean; xl: boolean }>',
    example: `const bp = useBreakpoint()
{() => bp().md ? <DesktopNav /> : <MobileNav />}`,
    notes: 'Reactive breakpoint flags driven by the **theme**, not raw media queries — reads `theme.breakpoints` so swapping themes (or unit systems) Just Works. Use `useMediaQuery` for one-off arbitrary queries. See also: useMediaQuery, useThemeValue.',
    mistakes: '- Using `useBreakpoint` for a one-off media query like `(prefers-contrast: more)` — `useBreakpoint` reads theme breakpoints only; use `useMediaQuery` for arbitrary media queries',
  },

  'hooks/useDebouncedValue': {
    signature: '<T>(source: Signal<T> | (() => T), delayMs: number) => Signal<T>',
    example: `const search = signal('')
const debouncedSearch = useDebouncedValue(search, 300)
effect(() => fetchResults(debouncedSearch()))`,
    notes: `Returns a debounced signal that only updates after \`delayMs\` of source-signal idle. Use for search-as-you-type, filter inputs, anywhere downstream effects shouldn't fire on every keystroke. The PAIR — \`useDebouncedCallback\` — debounces a function call instead of a value. See also: useDebouncedCallback, useThrottledCallback.`,
    mistakes: '- Reading the debounced signal immediately after setting the source — it still holds the OLD value during the debounce window; effects downstream of the debounced signal are correct, but imperative reads in the same tick are stale',
  },

  'hooks/useClipboard': {
    signature: '(timeoutMs?: number) => { copy: (text: string) => Promise<void>; copied: Signal<boolean> }',
    example: `const { copy, copied } = useClipboard()
<button onClick={() => copy(token)}>{() => copied() ? 'Copied!' : 'Copy'}</button>`,
    notes: '`navigator.clipboard.writeText` wrapped with a reactive `copied` flag that auto-resets after `timeoutMs` (default 2000). Use the `copied` signal to flash a "Copied!" UI cue without manual timer management. See also: useDialog, useOnline.',
  },

  'hooks/useDialog': {
    signature: '() => { ref: (el: HTMLDialogElement | null) => void; open: () => void; close: (returnValue?: string) => void; isOpen: Signal<boolean>; returnValue: Signal<string> }',
    example: `const dialog = useDialog()
<dialog ref={dialog.ref}>...</dialog>
<button onClick={dialog.open}>Open</button>`,
    notes: `Native \`<dialog>\` element wrapper with reactive \`isOpen\` / \`returnValue\` signals. Handles \`showModal()\` / \`close()\` plumbing and the \`cancel\`/\`close\` event wiring so consumers don't reimplement the boilerplate. See also: useFocusTrap, useScrollLock.`,
    mistakes: '- Calling `dialog.open()` before the ref callback has fired — Pyreon components run once, so the `<dialog>` must be in the initial render (not behind a conditional `<Show>`); the ref callback fires synchronously during mount, and `dialog.open()` before that point has no element to call `showModal()` on',
  },

  'hooks/useTimeAgo': {
    signature: '(date: Date | (() => Date), opts?: UseTimeAgoOptions) => Signal<string>',
    example: `const sent = useTimeAgo(message.sentAt)
<span>{sent}</span>`,
    notes: 'Reactive "5 minutes ago" / "in 2 hours" relative-time string. Auto-updates on a sensible interval (every minute under an hour, every hour under a day, etc.) so the UI stays accurate without manual scheduling. Cleans up the interval on unmount. See also: useInterval, useDebouncedValue.',
  },

  'hooks/useInfiniteScroll': {
    signature: '(onLoadMore: () => void | Promise<void>, opts?: { rootMargin?: string; threshold?: number; enabled?: () => boolean }) => { sentinelRef: (el: HTMLElement | null) => void; isLoading: Signal<boolean> }',
    example: `const { sentinelRef, isLoading } = useInfiniteScroll(loadNextPage, { rootMargin: '200px', enabled: () => hasMore() })
<For each={items()} by={(i) => i.id}>{(item) => <Row data={item} />}</For>
<div ref={sentinelRef}>{() => isLoading() && 'Loading…'}</div>`,
    notes: `\`IntersectionObserver\`-based infinite loading. Attach the returned \`sentinelRef\` to a node at the bottom of the list — when it scrolls into view, \`onLoadMore\` fires. \`isLoading\` blocks re-fires until the promise resolves. \`enabled\` accessor lets you stop observing once you've loaded the last page. See also: useIntersection.`,
    mistakes: `- Placing the sentinel inside a container with \`overflow: hidden\` and no scroll — IntersectionObserver never fires because the sentinel is always clipped; the sentinel must be inside the scrollable container
- Forgetting to pass \`enabled: () => hasMore()\` — the hook keeps calling \`onLoadMore\` even after the last page`,
  },

  'hooks/useMergedRef': {
    signature: '<T>(...refs: (Ref<T> | RefCallback<T> | null | undefined)[]) => RefCallback<T>',
    example: `const localRef = ref<HTMLDivElement>()
const merged = useMergedRef(localRef, props.ref)
<div ref={merged}>...</div>`,
    notes: 'Combine multiple refs into a single callback ref — used when forwarding `props.ref` while also keeping a local ref to the same element. Each provided ref (callback or object) receives the element on mount and `null` on unmount. See also: useEventListener.',
  },

  'hooks/useUpdateEffect': {
    signature: '(fn: () => void | (() => void), deps: Signal<unknown>[]) => void',
    example: `useUpdateEffect(() => api.save(value()), [value])
// Doesn't fire on initial mount — only on subsequent value changes`,
    notes: 'Like `effect` but skips the initial run — only fires when one of the tracked signals updates *after* mount. Use for "save on change but not on first render" patterns where the initial value is already persisted. See also: useIsomorphicLayoutEffect.',
  },

  'hooks/useIsomorphicLayoutEffect': {
    signature: '(fn: () => void | (() => void)) => void',
    example: `const ref = signal<HTMLDivElement | null>(null)
useIsomorphicLayoutEffect(() => {
  const el = ref()
  if (el) widthSig.set(el.getBoundingClientRect().width)
})`,
    notes: 'Runs a layout-phase effect on the client (synchronous, before paint) and a no-op on the server. Use when you need to read DOM measurements before the next paint without triggering an SSR mismatch warning. See also: useUpdateEffect, useElementSize.',
  },
  // <gen-docs:api-reference:end @pyreon/hooks>

  // ═══════════════════════════════════════════════════════════════════════════
  // @pyreon/permissions
  // ═══════════════════════════════════════════════════════════════════════════

  // <gen-docs:api-reference:start @pyreon/permissions>

  'permissions/createPermissions': {
    signature: '<T extends PermissionMap>(initial?: T) => Permissions',
    example: `const can = createPermissions({
  'posts.read': true,
  'posts.delete': (post) => post.authorId === userId,
  'admin.*': false,
})

can('posts.read')         // true (reactive)
can('posts.delete', post) // evaluates predicate
can.not('admin.dashboard')
can.all('posts.read', 'posts.create')
can.any('admin.users', 'posts.read')
can.set({ 'admin.*': true })  // replace all
can.patch({ 'posts.delete': true })  // merge`,
    notes: 'Create a reactive permissions instance. Returns a callable object — `can(key, context?)` checks a permission reactively (reads as a signal in effects and JSX). Permissions can be booleans or predicate functions `(context?) => boolean`. Supports wildcard keys (`admin.*`). The instance exposes `.not()`, `.all()`, `.any()` for multi-checks, and `.set()` / `.patch()` for runtime updates. See also: PermissionsProvider, usePermissions.',
    mistakes: `- Reading \`can("key")\` outside a reactive scope and expecting updates — the check is a signal read, it only re-evaluates inside \`effect()\`, \`computed()\`, or JSX expression thunks
- Using a static object instead of a predicate for context-dependent checks — \`'posts.update': true\` always passes, use \`(post) => post.authorId === userId()\` for ABAC
- Forgetting that wildcard \`admin.*\` only matches one level — \`admin.users.list\` is NOT matched by \`admin.*\`, only \`admin.users\` is`,
  },

  'permissions/PermissionsProvider': {
    signature: '(props: { value: Permissions; children: VNodeChild }) => VNodeChild',
    example: `<PermissionsProvider value={can}>
  <App />
</PermissionsProvider>`,
    notes: 'Context provider that makes a permissions instance available to descendant components via `usePermissions()`. Enables SSR isolation (per-request permissions) and testing (override permissions per test). See also: usePermissions, createPermissions.',
  },

  'permissions/usePermissions': {
    signature: '() => Permissions',
    example: `const can = usePermissions()
return (() => can('admin.dashboard') ? <Dashboard /> : <AccessDenied />)`,
    notes: 'Consume the nearest `PermissionsProvider` value. Returns the same callable `Permissions` instance. Throws if no provider is mounted. See also: PermissionsProvider, createPermissions.',
  },
  // <gen-docs:api-reference:end @pyreon/permissions>

  // ═══════════════════════════════════════════════════════════════════════════
  // @pyreon/machine
  // ═══════════════════════════════════════════════════════════════════════════

  // <gen-docs:api-reference:start @pyreon/machine>

  'machine/createMachine': {
    signature: '<S extends string, E extends string>(config: MachineConfig<S, E>) => Machine<S, E>',
    example: `const traffic = createMachine({
  initial: 'red',
  states: {
    red:    { on: { NEXT: 'green' } },
    green:  { on: { NEXT: 'yellow' } },
    yellow: { on: { NEXT: 'red' } },
  },
})

traffic()            // 'red' (reactive)
traffic.send('NEXT') // 'green'
traffic.matches('green') // true
traffic.can('NEXT')  // true`,
    notes: 'Create a reactive state machine. The returned machine reads like a signal (`machine()` returns the current state string) and transitions via `machine.send(event, payload?)`. States and events are type-safe — TypeScript infers the union from the config object. Guards enable conditional transitions with typed payloads. No built-in context or effects — use Pyreon signals and `effect()` alongside the machine for data and side effects. See also: Machine, MachineConfig.',
    mistakes: `- Expecting \`machine.send()\` to return the new state — it returns void; read the state with \`machine()\` after sending
- Calling \`machine.set()\` — machines are constrained signals, they do not expose \`.set()\`. State changes only happen through \`machine.send(event)\`
- Using a machine for data storage — machines only hold the current state string. Use regular signals alongside the machine for associated data
- Forgetting guard payloads — \`machine.send("LOGIN")\` without the required payload silently fails the guard`,
  },
  // <gen-docs:api-reference:end @pyreon/machine>

  // ═══════════════════════════════════════════════════════════════════════════
  // @pyreon/storage
  // ═══════════════════════════════════════════════════════════════════════════

  // <gen-docs:api-reference:start @pyreon/storage>

  'storage/useStorage': {
    signature: '<T>(key: string, defaultValue: T, options?: StorageOptions<T>) => StorageSignal<T>',
    example: `const theme = useStorage('theme', 'light')
theme()           // 'light'
theme.set('dark') // persists + cross-tab sync
theme.remove()    // delete from storage, reset to default`,
    notes: 'Create a reactive signal backed by localStorage. Reads the stored value on creation (falling back to `defaultValue` if absent or on SSR), writes on every `.set()`, and syncs across browser tabs via `storage` events. Returns `StorageSignal<T>` which extends `Signal<T>` with `.remove()` to delete the key and reset to default. Serialization defaults to JSON; provide custom `serialize`/`deserialize` in options for non-JSON types. See also: useSessionStorage, useCookie, useIndexedDB, createStorage.',
    mistakes: `- Expecting cross-tab sync with \`useSessionStorage\` — only \`useStorage\` (localStorage) fires storage events across tabs
- Storing non-serializable values (functions, class instances) without custom \`serialize\`/\`deserialize\` — JSON.stringify drops them silently
- Reading \`.remove()\` return value — it returns void, not the removed value`,
  },

  'storage/useCookie': {
    signature: '<T>(key: string, defaultValue: T, options?: CookieOptions) => StorageSignal<T>',
    example: `const locale = useCookie('locale', 'en', { maxAge: 365 * 86400, path: '/' })
locale.set('fr')`,
    notes: 'Reactive signal backed by browser cookies. SSR-readable — on the server, reads from the request cookie header via `setCookieSource()`. Options include `maxAge`, `path`, `domain`, `sameSite`, `secure`. Same `StorageSignal<T>` return type as other hooks. See also: useStorage, setCookieSource.',
  },

  'storage/useIndexedDB': {
    signature: '<T>(key: string, defaultValue: T, options?: IndexedDBOptions) => StorageSignal<T>',
    example: `const draft = useIndexedDB('article-draft', { title: '', body: '' })
draft.set({ title: 'New Article', body: 'Content...' })`,
    notes: 'Reactive signal backed by IndexedDB for large data. Writes are debounced to avoid excessive I/O. The signal initializes with `defaultValue` synchronously and hydrates from IndexedDB asynchronously — the value updates reactively once the read completes. Silent init error logging in dev mode. See also: useStorage, useMemoryStorage.',
  },

  'storage/createStorage': {
    signature: '(backend: StorageBackend | AsyncStorageBackend) => <T>(key: string, defaultValue: T, options?: StorageOptions<T>) => StorageSignal<T>',
    example: `const useEncrypted = createStorage({
  getItem: (key) => decrypt(localStorage.getItem(key)),
  setItem: (key, value) => localStorage.setItem(key, encrypt(value)),
  removeItem: (key) => localStorage.removeItem(key),
})
const secret = useEncrypted('api-key', '')`,
    notes: 'Factory for custom storage backends. Pass an object with `getItem`, `setItem`, `removeItem` methods (sync or async) and receive a hook function with the same signature as `useStorage`. Use for encrypted storage, remote backends, or any custom persistence layer. See also: useStorage.',
  },
  // <gen-docs:api-reference:end @pyreon/storage>

  // ═══════════════════════════════════════════════════════════════════════════
  // @pyreon/i18n
  // ═══════════════════════════════════════════════════════════════════════════

  // <gen-docs:api-reference:start @pyreon/i18n>

  'i18n/createI18n': {
    signature: '(options: I18nOptions) => I18nInstance',
    example: `const i18n = createI18n({
  locale: 'en',
  messages: { en: { greeting: 'Hello, {{name}}!' } },
  loader: (locale, ns) => import(\`./locales/\${locale}/\${ns}.json\`),
  fallbackLocale: 'en',
})

i18n.t('greeting', { name: 'World' })  // "Hello, World!"
i18n.locale.set('fr')  // switch reactively`,
    notes: 'Create a reactive i18n instance. Returns `{ t, locale, addMessages, loadNamespace }`. The `t(key, values?)` function resolves translations reactively — changing `locale` via `.set()` re-evaluates all `t()` reads in reactive scopes. Supports `{{name}}` interpolation, `_one`/`_other` plural suffixes, namespace lazy loading with deduplication, fallback locale, and custom plural rules. Available from both `@pyreon/i18n` and `@pyreon/i18n/core`. See also: I18nProvider, useI18n, Trans, interpolate.',
    mistakes: `- Reading \`t(key)\` outside a reactive scope and expecting updates on locale change — \`t()\` is a reactive signal read, wrap in JSX thunk or \`effect()\`
- Using \`@pyreon/i18n\` on the backend — use \`@pyreon/i18n/core\` instead, it has zero JSX/core dependencies
- Forgetting \`fallbackLocale\` — missing keys in the current locale return the key string instead of falling back to another language`,
  },

  'i18n/I18nProvider': {
    signature: '(props: I18nProviderProps) => VNodeChild',
    example: `<I18nProvider value={i18n}>
  <App />
</I18nProvider>`,
    notes: 'Context provider that makes an i18n instance available to descendant components via `useI18n()`. Only available from the full `@pyreon/i18n` entry, not from `/core`. See also: useI18n, createI18n.',
  },

  'i18n/useI18n': {
    signature: '() => I18nInstance',
    example: `const { t, locale } = useI18n()
return <div>{() => t('greeting', { name: 'User' })}</div>`,
    notes: 'Consume the nearest `I18nProvider` value. Returns the same `I18nInstance` with `t`, `locale`, `addMessages`, etc. Only available from the full `@pyreon/i18n` entry. See also: I18nProvider, createI18n.',
  },

  'i18n/Trans': {
    signature: '(props: TransProps) => VNodeChild',
    example: `// Message: "Please <link>click here</link> to continue"
<Trans key="action" components={{ link: <a href="/next" /> }}>
  Please <link>click here</link> to continue
</Trans>`,
    notes: 'Rich text interpolation component. Translates a key and replaces named placeholders with JSX components. Use for translations that contain markup (bold, links, etc.) that cannot be expressed as plain string interpolation. See also: createI18n, useI18n.',
  },

  'i18n/interpolate': {
    signature: '(template: string, values?: InterpolationValues) => string',
    example: `interpolate('Hello, {{name}}!', { name: 'World' })  // 'Hello, World!'`,
    notes: 'Pure string interpolation — replaces `{{name}}` placeholders with values from the map. Available from both entries. Use directly when you need interpolation without the full i18n instance (e.g. server-side email templates). See also: createI18n.',
  },
  // <gen-docs:api-reference:end @pyreon/i18n>

  // ═══════════════════════════════════════════════════════════════════════════
  // @pyreon/document
  // ═══════════════════════════════════════════════════════════════════════════

  // <gen-docs:api-reference:start @pyreon/document>

  'document/render': {
    signature: '(node: DocNode, format: OutputFormat, options?: RenderOptions) => Promise<RenderResult>',
    example: `const pdf = await render(doc, 'pdf')            // Uint8Array
const html = await render(doc, 'html')           // string
const email = await render(doc, 'email')         // Outlook-safe HTML
const md = await render(doc, 'md')               // Markdown string
const slack = await render(doc, 'slack')          // Slack Block Kit JSON`,
    notes: 'Render a document node tree to any supported format. Returns a string (HTML, Markdown, text, CSV, email, Slack, Teams, etc.) or Uint8Array (PDF, DOCX, XLSX, PPTX) depending on the format. Heavy format renderers are lazy-loaded on first use. Supports 14+ built-in formats plus custom renderers registered via `registerRenderer()`. See also: createDocument, Document, download, registerRenderer.',
    mistakes: `- Not awaiting the render call — render() is always async due to lazy-loaded format renderers
- Expecting render("pdf") to return a string — PDF, DOCX, XLSX, PPTX return Uint8Array
- Passing a VNode instead of a DocNode — render() expects the output of JSX primitives (Document, Page, etc.) or createDocument(), not arbitrary Pyreon VNodes`,
  },

  'document/createDocument': {
    signature: '(props?: DocumentProps) => DocumentBuilder',
    example: `const doc = createDocument({ title: 'Report' })
  .heading('Sales Report')
  .text('Q4 2026 summary.')
  .table({ columns: ['Region', 'Revenue'], rows: [['US', '$1M']] })

await doc.toPdf()      // PDF Uint8Array
await doc.toEmail()    // Outlook-safe HTML
await doc.toDocx()     // Word document`,
    notes: 'Fluent builder API for constructing documents without JSX. Chain `.heading()`, `.text()`, `.table()`, `.image()`, `.list()`, `.code()`, `.divider()`, `.page()` calls. Terminal methods: `.toPdf()`, `.toDocx()`, `.toEmail()`, `.toSlack()`, `.toNotion()`, `.toHtml()`, `.toMarkdown()`, etc. Each terminal method calls `render()` internally. See also: render, Document.',
    mistakes: `- Forgetting to await terminal methods — toPdf(), toDocx(), etc. are async
- Calling builder methods after a terminal method — the builder is consumed; create a new one`,
  },

  'document/Document': {
    signature: '(props: DocumentProps) => DocNode',
    example: `const doc = (
  <Document title="Report" author="Team">
    <Page>
      <Heading>Title</Heading>
      <Text>Content</Text>
    </Page>
  </Document>
)
await render(doc, 'pdf')`,
    notes: 'Root JSX primitive for document trees. Accepts `title`, `author`, `subject` as metadata props. Children should be `Page` elements (or other block-level primitives for single-page documents). The returned DocNode is passed to `render()` for output. See also: render, Page, createDocument.',
  },

  'document/download': {
    signature: '(data: Uint8Array | string, filename: string) => void',
    example: `const pdf = await render(doc, 'pdf')
download(pdf, 'report.pdf')`,
    notes: 'Browser helper that triggers a file download from rendered document data. Creates a temporary Blob URL and clicks a hidden anchor element. Works with both Uint8Array (PDF, DOCX) and string (HTML, Markdown) outputs from `render()`. See also: render.',
  },
  // <gen-docs:api-reference:end @pyreon/document>

  // ═══════════════════════════════════════════════════════════════════════════
  // @pyreon/flow
  // ═══════════════════════════════════════════════════════════════════════════

  // <gen-docs:api-reference:start @pyreon/flow>

  'flow/createFlow': {
    signature: '<TData = Record<string, unknown>>(config: FlowConfig<TData>) => FlowInstance<TData>',
    example: `// Generic over node data shape — typed consumers get strong narrowing
interface WorkflowData {
  kind: 'trigger' | 'filter' | 'transform' | 'notify'
  label: string
}

const flow = createFlow<WorkflowData>({
  nodes: [
    { id: '1', type: 'custom', position: { x: 0, y: 0 }, data: { kind: 'trigger', label: 'Start' } },
    { id: '2', type: 'custom', position: { x: 200, y: 100 }, data: { kind: 'notify', label: 'End' } },
  ],
  edges: [{ id: 'e1', source: '1', target: '2', animated: true }],
})

// node.data.kind narrows to the typed union, not unknown
const trigger = flow.findNodes((n) => n.data.kind === 'trigger')

flow.addNode({ id: '3', type: 'custom', position: { x: 100, y: 200 }, data: { kind: 'transform', label: 'New' } })
await flow.layout('layered', { direction: 'RIGHT', nodeSpacing: 50, layerSpacing: 100 })
// LayoutOptions applicability: direction / layerSpacing / edgeRouting apply to layered/tree only;
// force/stress/radial/box/rectpacking silently ignore them. nodeSpacing applies to all algorithms.
const json = flow.toJSON(); flow.fromJSON(json)       // round-trip serialization`,
    notes: 'Create a reactive flow instance. Generic over node data shape — `createFlow<MyData>(...)` returns `FlowInstance<MyData>` so `node.data.kind` narrows correctly without an `[key: string]: unknown` index signature on consumer types. Defaults to `Record<string, unknown>` when no generic is supplied. The returned instance owns signal-native nodes / edges and exposes CRUD, selection, viewport (zoom / pan / fitView), and auto-layout via lazy-loaded elkjs (first `.layout()` call fetches a ~1.4MB chunk). Pan / zoom uses pointer events + CSS transforms — no D3. See also: useFlow, FlowInstance, Flow.',
    mistakes: `- Forgetting to declare \`@pyreon/runtime-dom\` in consumer app deps — flow's JSX emits \`_tpl()\` which needs runtime-dom imports
- Reading \`NodeComponentProps.data\` / \`.selected\` / \`.dragging\` as plain values — all three are REACTIVE ACCESSORS: \`props.data()\`, \`props.selected()\`, \`props.dragging()\`
- Calling \`props.data()\` OUTSIDE a reactive scope — captures the value once at component setup, defeating the per-node reactivity. Read it inside JSX expression thunks, \`effect\`, or \`computed\`
- Adding \`[key: string]: unknown\` index signature to your node data interface — no longer needed now that \`createFlow\` is generic. Pass \`createFlow<MyData>(...)\` instead
- Setting \`LayoutOptions.direction\` (or \`layerSpacing\`, or \`edgeRouting\`) on a force / stress / radial / box / rectpacking layout and expecting a directional result — these options are namespaced under ELK's layered / tree pipelines and silently ignored by the geometric algorithms. Dev-mode \`console.warn\` fires when this happens
- Missing \`<Flow nodeTypes={{ key: Component }}>\` registration — \`node.type\` strings dispatch to that map, unregistered types fall through to the default renderer
- Using \`createFlow\` inside a component body without \`onUnmount(() => flow.dispose())\` — prefer \`useFlow\` which auto-disposes
- Using \`direction: 'row'\` on flow's containing Element layout — Pyreon \`Element\` accepts \`'inline'\` / \`'rows'\` / \`'reverseInline'\` / \`'reverseRows'\`, not CSS flex-direction values like \`'row'\` or \`'column'\``,
  },

  'flow/useFlow': {
    signature: '<TData = Record<string, unknown>>(config: FlowConfig<TData>) => FlowInstance<TData>',
    example: `// Component-scoped flow — auto-disposes when the component unmounts.
// Identical shape to createFlow, plus an implicit onUnmount(() => flow.dispose()).
const MyDiagram = () => {
  const flow = useFlow<WorkflowData>({
    nodes: [{ id: '1', position: { x: 0, y: 0 }, data: { kind: 'trigger', label: 'Start' } }],
    edges: [],
  })
  return (
    <Flow instance={flow}>
      <Background />
    </Flow>
  )
}`,
    notes: `Component-scoped wrapper around \`createFlow\` — identical shape plus an implicit \`onUnmount(() => flow.dispose())\`. Prefer inside component bodies; use \`createFlow\` directly only for flows owned outside the component tree (app stores, singletons, SSR-shared state) where you'll dispose at the correct lifecycle point yourself. See also: createFlow.`,
    mistakes: `- Using \`useFlow\` outside a component body — the \`onUnmount\` hook registration requires an active component setup context, same constraint as every \`useX\` hook
- Using \`createFlow\` inside a component and forgetting \`onUnmount(() => flow.dispose())\` — that was the footgun \`useFlow\` exists to prevent
- Storing the returned instance in a module-level variable — bypasses the auto-dispose guarantee; use \`createFlow\` for that pattern`,
  },

  'flow/Flow': {
    signature: '(props: FlowComponentProps) => VNodeChild',
    example: `<Flow instance={flow} nodeTypes={{ custom: MyNode }} edgeTypes={{ arrow: ArrowEdge }}>
  <Background variant="dots" gap={20} />
  <Controls position="bottom-left" />
  <MiniMap nodeColor={(node) => '#6366f1'} />
</Flow>

// Custom node renderer — every prop except id is a REACTIVE ACCESSOR
function MyNode(props: NodeComponentProps<WorkflowData>) {
  return (
    <div
      class={() => (props.selected() ? 'selected' : '')}
      style={() => \`cursor: \${props.dragging() ? 'grabbing' : 'grab'}\`}
    >
      {() => props.data().label}
    </div>
  )
}`,
    notes: 'Main flow container. Accepts a `FlowInstance` via the `instance` prop plus optional `nodeTypes` / `edgeTypes` maps for custom renderers. Internally uses `<For>` keyed by `node.id` plus per-node reactive accessors that read live state from `instance.nodes()` — each node mounts EXACTLY ONCE across the lifetime of the graph regardless of drags, selection clicks, or `updateNode` mutations. A 60fps drag in a 1000-node graph stays O(1) per frame. JSX components are NOT generic at the call site (`<Flow<MyData> />` is invalid JSX); `FlowProps.instance` is typed as `FlowInstance<any>` so typed consumers can pass `FlowInstance<MyData>` without casting. See also: createFlow, Background, Controls, MiniMap, Handle.',
    mistakes: `- \`<Flow<MyData> />\` is invalid JSX — the component is not generic at the call site; pass a typed \`FlowInstance<MyData>\` via \`instance\` prop
- Missing \`nodeTypes\` entry for a \`node.type\` string — falls through to the default renderer
- Mutating \`instance.nodes()\` return value directly — use \`instance.addNode\` / \`updateNode\` / \`removeNode\` so the internal signals fire`,
  },

  'flow/Background': {
    signature: '(props: { variant?: "dots" | "lines"; gap?: number; color?: string }) => VNodeChild',
    example: `<Flow instance={flow}>
  <Background variant="dots" gap={24} color="#e5e7eb" />
</Flow>`,
    notes: 'Dot or line grid background inside a `<Flow>`. Place as a direct child. `variant` defaults to `"dots"`, `gap` controls pattern spacing, `color` sets the pattern color. Renders as an SVG pattern at the back of the z-order. See also: Flow, Controls, MiniMap.',
  },

  'flow/Controls': {
    signature: '(props?: { position?: "top-left" | "top-right" | "bottom-left" | "bottom-right" }) => VNodeChild',
    example: `<Flow instance={flow}>
  <Controls position="bottom-left" />
</Flow>`,
    notes: 'Zoom in / zoom out / fit-view button cluster. Renders absolutely inside the flow viewport at the configured corner (default `"bottom-right"`). Each button dispatches to the corresponding `FlowInstance` viewport method. See also: Flow, Background, MiniMap.',
  },

  'flow/MiniMap': {
    signature: '(props?: { nodeColor?: (node: FlowNode) => string; maskColor?: string }) => VNodeChild',
    example: `<Flow instance={flow}>
  <MiniMap nodeColor={(node) => node.data.highlighted ? '#f59e0b' : '#6366f1'} />
</Flow>`,
    notes: 'Overview minimap of the full graph. `nodeColor` is a per-node color function (default grey), `maskColor` fills the area outside the current viewport (default semi-transparent black). Clicks on the minimap recenter the main viewport. See also: Flow, Background, Controls.',
  },

  'flow/Handle': {
    signature: '(props: { type: "source" | "target"; position: Position; id?: string }) => VNodeChild',
    example: `function CustomNode(props: NodeComponentProps<MyData>) {
  return (
    <div>
      <Handle type="target" position={Position.Left} />
      {() => props.data().label}
      <Handle type="source" position={Position.Right} id="out-primary" />
      <Handle type="source" position={Position.Bottom} id="out-fallback" />
    </div>
  )
}

// Edge referencing a specific source handle by id
flow.addEdge({ source: '1', sourceHandle: 'out-primary', target: '2' })`,
    notes: 'Connection handle on a custom node — exposes a connectable point that edges attach to. `type` picks direction (`"source"` emits edges, `"target"` receives), `position` is a `Position` enum (`Top` / `Right` / `Bottom` / `Left`). Provide a distinct `id` when a node has multiple source or target handles so edges can reference the specific one via `edge.sourceHandle` / `edge.targetHandle`. See also: Flow, Position.',
    mistakes: `- Multiple \`source\` / \`target\` handles on one node without distinct \`id\` values — edges cannot disambiguate which handle they connect to
- Nesting a \`<Handle>\` inside a non-node component (a \`<Background>\` child, a \`<Panel>\`, etc.) — the connection machinery expects handles to live inside a node renderer`,
  },

  'flow/Panel': {
    signature: '(props: { position?: "top-left" | "top-right" | "bottom-left" | "bottom-right"; children: VNodeChild }) => VNodeChild',
    example: `<Flow instance={flow}>
  <Panel position="top-right">
    <button onClick={() => flow.fitView()}>Fit</button>
    <button onClick={() => flow.toJSON()}>Export</button>
  </Panel>
</Flow>`,
    notes: 'Overlay panel positioned absolutely relative to the flow viewport. Use for toolbars, legend badges, or contextual action buttons. Pass any JSX as children — the panel is a plain positioned container, not a predefined chrome component. See also: Flow, Controls.',
  },
  // <gen-docs:api-reference:end @pyreon/flow>

  // ═══════════════════════════════════════════════════════════════════════════
  // @pyreon/code

  // ═══════════════════════════════════════════════════════════════════════════
  // @pyreon/charts
  // ═══════════════════════════════════════════════════════════════════════════

  // <gen-docs:api-reference:start @pyreon/charts>

  'charts/useChart': {
    signature: '<TOption extends EChartsOption = EChartsOption>(optionsFn: () => TOption, config?: UseChartConfig) => UseChartResult',
    example: `const chart = useChart(() => ({
  xAxis: { type: 'category', data: months() },
  yAxis: { type: 'value' },
  series: [{ type: 'bar', data: revenue() }],
}))

<div ref={chart.ref} style="height: 400px" />
// chart.loading() — true until ECharts modules loaded + chart initialized
// chart.instance() — raw ECharts instance for imperative API`,
    notes: 'Create a reactive ECharts instance. Options are passed as a function — signal reads inside are tracked and the chart updates automatically when any tracked signal changes. Lazy-loads the required ECharts modules on first render (zero bytes until mount). Returns `ref` (bind to a container div), `instance` (Signal<ECharts | null>), `loading` (Signal<boolean>), `error` (Signal<Error | null>), and `resize()`. Auto-resizes via ResizeObserver and disposes on unmount. See also: Chart.',
    mistakes: `- Forgetting to set a height on the container div — ECharts requires explicit dimensions, it does not auto-size to content
- Passing options as a plain object instead of a function — signal reads are not tracked and the chart never updates
- Reading chart.instance() immediately after useChart — the instance is null until the async module load completes; check chart.loading() first
- Calling chart.resize() during SSR — useChart is browser-only; the hook no-ops safely on the server but resize is meaningless`,
  },

  'charts/Chart': {
    signature: '(props: ChartProps) => VNodeChild',
    example: `<Chart
  options={() => ({
    series: [{ type: 'pie', data: [{ value: 60, name: 'A' }, { value: 40, name: 'B' }] }],
  })}
  style="height: 300px"
  onClick={(params) => alert(params.name)}
/>`,
    notes: 'Declarative chart component that wraps `useChart` internally. Accepts `options` (reactive function), `style`/`class` for the container, and event handlers (`onClick`, `onMouseover`, etc.) that bind to the ECharts instance. Renders a div with the chart — auto-resizes and cleans up on unmount. Simpler than useChart for most use cases. See also: useChart.',
    mistakes: `- Missing style height on the Chart component — same as useChart, ECharts requires explicit container dimensions
- Passing a static options object — wrap in \`() => ({...})\` so signal reads inside are tracked reactively`,
  },
  // <gen-docs:api-reference:end @pyreon/charts>
  // ═══════════════════════════════════════════════════════════════════════════

  // <gen-docs:api-reference:start @pyreon/code>

  'code/createEditor': {
    signature: '(config: EditorConfig) => EditorInstance',
    example: `const editor = createEditor({
  value: '// hello',
  language: 'typescript',
  theme: 'dark',
  minimap: true,
  onChange: (next) => console.log('edit:', next),
})

editor.value()              // reactive read
editor.value.set('new')     // write into CodeMirror
editor.cursor()             // { line, col }
editor.lineCount()          // computed
editor.goToLine(42)
editor.insert('code')

<CodeEditor instance={editor} style="height: 400px" />`,
    notes: 'Create a reactive editor instance. `editor.value` is a writable Signal<string> — `editor.value()` reads reactively, `editor.value.set(next)` writes back into CodeMirror. `editor.cursor` and `editor.lineCount` are computed signals. Config accepts value, language, theme, minimap, lineNumbers, foldGutter, onChange, and more. The instance is framework-independent — mount it via `<CodeEditor instance={editor} />`. See also: CodeEditor, bindEditorToSignal, loadLanguage.',
    mistakes: `- Forgetting to declare @pyreon/runtime-dom in consumer app deps — <CodeEditor> JSX emits _tpl() which needs runtime-dom
- Hand-rolling the applyingFromExternal/applyingFromEditor flag pattern — use bindEditorToSignal instead
- Calling editor methods before mount — they no-op safely but changes don't persist
- Setting both vim: true and emacs: true — emacs wins`,
  },

  'code/bindEditorToSignal': {
    signature: '<T>(options: BindEditorToSignalOptions<T>) => EditorBinding',
    example: `const data = signal<Doc>({ name: 'Alice', count: 1 })
const editor = createEditor({ value: JSON.stringify(data(), null, 2), language: 'json' })

const binding = bindEditorToSignal({
  editor,
  signal: data,
  serialize: (val) => JSON.stringify(val, null, 2),
  parse: (text) => { try { return JSON.parse(text) } catch { return null } },
  onParseError: (err) => console.warn(err.message),
})
// binding.dispose() on unmount`,
    notes: 'Two-way binding between an editor instance and an external Signal<T> (or SignalLike<T>). Replaces the recurring loop-prevention flag-pair boilerplate. Round-trips through user-supplied `serialize`/`parse` functions. Internal flags break the format-on-input race; parse failures call `onParseError` and leave the external state at its last valid value. Returns `{ dispose }` for cleanup. See also: createEditor.',
    mistakes: `- Forgetting to call binding.dispose() on unmount — leaks both effects
- Non-deterministic serialize() — if serialize(parse(text)) varies on each call, the helper dispatches redundant writes that fight the user's typing
- Returning a non-null value from parse() for malformed input — return null on failure, or throw
- Using bindEditorToSignal AND a manual editor.value.set() loop — defeats loop prevention`,
  },

  'code/CodeEditor': {
    signature: '(props: CodeEditorProps) => VNodeChild',
    example: '<CodeEditor instance={editor} style="height: 400px" class="my-editor" />',
    notes: 'Mount component for a `createEditor` instance. Accepts `instance`, `style`, `class`, and passes through to a container div. Auto-mounts the CodeMirror view on render and cleans up on unmount. See also: createEditor, DiffEditor, TabbedEditor.',
  },

  'code/DiffEditor': {
    signature: '(props: DiffEditorProps) => VNodeChild',
    example: '<DiffEditor original="old code" modified="new code" language="typescript" />',
    notes: 'Side-by-side diff editor. Accepts `original` and `modified` strings plus optional `language` and `theme`. Renders two CodeMirror instances with unified diff highlighting via @codemirror/merge. See also: CodeEditor, TabbedEditor.',
  },

  'code/loadLanguage': {
    signature: '(lang: EditorLanguage) => Promise<void>',
    example: `await loadLanguage('python')
// Now 'python' is available in createEditor({ language: 'python' })`,
    notes: 'Lazy-load a language grammar. Supports 19 languages: json, typescript, javascript, python, css, html, markdown, rust, go, java, cpp, sql, xml, yaml, php, and more. Grammars are declared as optional dependencies and loaded on demand. See also: createEditor, getAvailableLanguages.',
  },

  'code/minimapExtension': {
    signature: '() => Extension',
    example: `const editor = createEditor({ value: longCode, minimap: true })
// or: import { minimapExtension } from '@pyreon/code'`,
    notes: 'CodeMirror extension that renders a canvas-based code overview minimap. Enable via `createEditor({ minimap: true })` or add the extension manually to a CodeMirror state. See also: createEditor.',
  },
  // <gen-docs:api-reference:end @pyreon/code>

  // ═══════════════════════════════════════════════════════════════════════════
  // @pyreon/hotkeys
  // ═══════════════════════════════════════════════════════════════════════════

  // <gen-docs:api-reference:start @pyreon/hotkeys>

  'hotkeys/useHotkey': {
    signature: '(shortcut: string, handler: (e: KeyboardEvent) => void, options?: HotkeyOptions) => void',
    example: `useHotkey('mod+s', (e) => {
  e.preventDefault()
  save()
}, { description: 'Save' })

useHotkey('ctrl+z', () => undo(), { scope: 'editor' })
useHotkey('escape', () => close(), { enableOnFormElements: true })`,
    notes: `Register a keyboard shortcut that auto-unregisters when the component unmounts. Shortcut format: \`mod+s\`, \`ctrl+shift+p\`, \`escape\`, etc. \`mod\` is Command on Mac, Ctrl elsewhere. By default, shortcuts don't fire when focused on form elements (input, textarea, select) — override with \`enableOnFormElements: true\`. Supports \`scope\` option for context-aware activation and \`description\` for introspection. See also: useHotkeyScope, registerHotkey.`,
    mistakes: `- Forgetting e.preventDefault() for browser-reserved shortcuts (mod+s, mod+p) — the browser dialog fires alongside your handler
- Registering the same shortcut in overlapping scopes without priority — both handlers fire; use scope isolation to prevent conflicts
- Using useHotkey outside a component body — the onUnmount cleanup requires an active component setup context
- Not activating the scope — useHotkey with a scope option does nothing unless useHotkeyScope(scope) is called or enableScope(scope) is invoked`,
  },

  'hotkeys/useHotkeyScope': {
    signature: '(scope: string) => void',
    example: `// In an editor component:
useHotkeyScope('editor')
useHotkey('ctrl+z', () => undo(), { scope: 'editor' })

// In a modal component:
useHotkeyScope('modal')
useHotkey('escape', () => close(), { scope: 'modal' })`,
    notes: 'Activate a hotkey scope for the lifetime of the current component. When the component mounts, the scope is enabled; when it unmounts, the scope is disabled. Shortcuts registered with a matching `scope` option only fire when the scope is active. Multiple components can activate the same scope — it stays active until the last one unmounts. See also: useHotkey, enableScope, disableScope.',
    mistakes: `- Using useHotkeyScope outside a component body — the lifecycle hooks require an active setup context
- Assuming scope deactivation is immediate on unmount — if another component also activated the scope, it stays active`,
  },

  'hotkeys/registerHotkey': {
    signature: '(shortcut: string, handler: (e: KeyboardEvent) => void, options?: HotkeyOptions) => () => void',
    example: `const unregister = registerHotkey('ctrl+q', () => quit(), { scope: 'global' })
// Later:
unregister()`,
    notes: 'Imperative hotkey registration for non-component contexts (stores, global setup). Returns an unregister function. Unlike useHotkey, this does NOT auto-cleanup on unmount — caller is responsible for calling the returned unregister function. See also: useHotkey.',
  },
  // <gen-docs:api-reference:end @pyreon/hotkeys>

  // ═══════════════════════════════════════════════════════════════════════════
  // @pyreon/table
  // ═══════════════════════════════════════════════════════════════════════════

  // <gen-docs:api-reference:start @pyreon/table>

  'table/useTable': {
    signature: '<TData extends RowData>(options: () => TableOptions<TData>) => Computed<Table<TData>>',
    example: `const table = useTable(() => ({
  data: users(),
  columns: [
    { accessorKey: 'name', header: 'Name' },
    { accessorKey: 'email', header: 'Email' },
  ],
  getCoreRowModel: getCoreRowModel(),
}))

// Read inside reactive scope:
<For each={() => table().getRowModel().rows} by={(r) => r.id}>
  {(row) => <tr>...</tr>}
</For>`,
    notes: 'Create a reactive TanStack Table instance. Options are passed as a function so reactive signals (data, columns, sorting state) can be read inside and the table updates automatically when they change. Returns a Computed<Table<T>> — read it inside JSX expression thunks or effects to track state changes. Internal state management uses a version counter to force re-notification even when the table reference is the same object. See also: flexRender.',
    mistakes: `- Passing options as a plain object instead of a function — signal reads are not tracked and the table never updates when data changes
- Reading \`table\` without calling it — \`table\` is a Computed, you must call \`table()\` to get the Table instance
- Forgetting getCoreRowModel() — TanStack Table requires at least getCoreRowModel in options or it throws
- Using \`.map()\` on rows instead of \`<For>\` — loses Pyreon's keyed reconciliation and fine-grained DOM updates`,
  },

  'table/flexRender': {
    signature: '<TData extends RowData, TValue>(component: Renderable<TValue>, props: TValue) => unknown',
    example: `// Header:
flexRender(header.column.columnDef.header, header.getContext())
// Cell:
flexRender(cell.column.columnDef.cell, cell.getContext())`,
    notes: 'Render a TanStack Table column definition template (header, cell, or footer). Handles strings, numbers, functions (component functions or render functions), and VNodes. Returns the rendered output or null for undefined/null inputs. Use in JSX to render column definitions provided by TanStack Table. See also: useTable.',
    mistakes: `- Wrapping flexRender output in an extra function accessor — the result is already renderable JSX content
- Passing the column def directly instead of calling getContext() — TanStack Table requires the context object`,
  },
  // <gen-docs:api-reference:end @pyreon/table>

  // ═══════════════════════════════════════════════════════════════════════════
  // @pyreon/virtual
  // ═══════════════════════════════════════════════════════════════════════════

  // <gen-docs:api-reference:start @pyreon/virtual>

  'virtual/useVirtualizer': {
    signature: '(options: UseVirtualizerOptions) => UseVirtualizerResult',
    example: `const virtualizer = useVirtualizer({
  count: () => items().length,
  getScrollElement: () => scrollRef,
  estimateSize: () => 35,
  overscan: 5,
})

// virtualItems() is reactive — re-evaluates as user scrolls
<For each={() => virtualizer.virtualItems()} by={(item) => item.index}>
  {(item) => <div style={() => \`top: \${item.start}px\`}>{item.index}</div>}
</For>`,
    notes: 'Create an element-scoped virtualizer. Attach to a scrollable container via `getScrollElement`. Returns reactive `virtualItems()`, `totalSize()`, and `isScrolling()` signals plus `scrollToIndex()` and `scrollToOffset()` for programmatic control. Options that accept functions (`count`, `estimateSize`) track signal reads reactively. See also: useWindowVirtualizer.',
    mistakes: `- Forgetting to set a fixed height on the scroll container — without overflow:auto + a height, the virtualizer has no viewport to measure
- Passing count as a plain number instead of a function when the list length is dynamic — the virtualizer won't update when items change
- Reading virtualItems() outside a reactive scope — captures the initial window only, never updates on scroll
- Using .map() instead of <For> on virtualItems — loses keyed reconciliation`,
  },

  'virtual/useWindowVirtualizer': {
    signature: '(options: UseWindowVirtualizerOptions) => UseWindowVirtualizerResult',
    example: `const virtualizer = useWindowVirtualizer({
  count: () => items().length,
  estimateSize: () => 50,
})

<div style={() => \`height: \${virtualizer.totalSize()}px; position: relative\`}>
  <For each={() => virtualizer.virtualItems()} by={(item) => item.index}>
    {(item) => <div style={() => \`position: absolute; top: \${item.start}px\`}>Row {item.index}</div>}
  </For>
</div>`,
    notes: 'Create a window-scoped virtualizer that uses the browser window as the scroll container. SSR-safe — checks for browser environment before attaching scroll listeners. Same return shape as `useVirtualizer` (virtualItems, totalSize, isScrolling, scrollToIndex). Use for long page-level lists where the entire page scrolls. See also: useVirtualizer.',
    mistakes: `- Using useWindowVirtualizer inside a scrollable container that is not the window — use useVirtualizer with getScrollElement instead
- Forgetting to position items absolutely inside a relative container with the total height — items overlap or collapse`,
  },
  // <gen-docs:api-reference:end @pyreon/virtual>

  // ═══════════════════════════════════════════════════════════════════════════
  // @pyreon/feature
  // ═══════════════════════════════════════════════════════════════════════════

  // <gen-docs:api-reference:start @pyreon/feature>

  'feature/defineFeature': {
    signature: '<T>(config: FeatureConfig<T>) => Feature<T>',
    example: `const Posts = defineFeature({
  name: 'posts',
  schema: {
    title: 'string',
    body: 'string',
    author: reference('users'),
  },
  api: { baseUrl: '/api/posts' },
})

Posts.useList({ page: 1 })
Posts.useById('123')
Posts.useCreate()
Posts.useForm('123')
Posts.useTable({ columns: ['title', 'author'] })`,
    notes: 'Define a schema-driven CRUD feature. Accepts a name, field schema, and API config. Returns a Feature object with auto-generated hooks: `useList`, `useById`, `useSearch`, `useCreate`, `useUpdate`, `useDelete`, `useForm`, `useTable`, `useStore`. Composes @pyreon/query (data fetching), @pyreon/form (form state), @pyreon/validation (schema validation), @pyreon/store (global state), and @pyreon/table (table configuration). Schema field types are inferred for TypeScript autocompletion across all generated hooks. See also: reference, extractFields, defaultInitialValues.',
    mistakes: `- Forgetting to install peer dependencies — defineFeature composes @pyreon/query, @pyreon/form, @pyreon/validation, @pyreon/store, @pyreon/table internally
- Using defineFeature without a QueryClient provider — useList/useById/useSearch/useCreate/useUpdate/useDelete all depend on @pyreon/query which requires a QueryClient in context
- Passing schema field types as TypeScript types instead of string literals — schema values must be runtime strings like \`"string"\`, \`"number"\`, \`"boolean"\`, or \`reference("otherFeature")\`
- Calling useForm without an id for edit mode — pass an id to load existing data, omit it for create mode`,
  },

  'feature/reference': {
    signature: '(featureName: string) => ReferenceSchema',
    example: `const Posts = defineFeature({
  name: 'posts',
  schema: {
    title: 'string',
    author: reference('users'),    // FK to users feature
    category: reference('categories'),
  },
  api: { baseUrl: '/api/posts' },
})`,
    notes: 'Mark a schema field as a foreign key reference to another feature. Used inside defineFeature schema definitions to establish relationships between features. The generated form and table hooks understand reference fields and can render appropriate UI (select dropdowns, linked displays). See also: defineFeature.',
  },
  // <gen-docs:api-reference:end @pyreon/feature>

  // ═══════════════════════════════════════════════════════════════════════════
  // @pyreon/storybook
  // ═══════════════════════════════════════════════════════════════════════════

  // ═══════════════════════════════════════════════════════════════════════════
  // @pyreon/lint
  // ═══════════════════════════════════════════════════════════════════════════

  'lint/lint': {
    signature: 'lint(options?: LintOptions): LintResult',
    example: `import { lint } from "@pyreon/lint"

const result = lint({ paths: ["src/"], preset: "recommended" })
console.log(result.totalErrors, result.totalWarnings)
// Config-level diagnostics (malformed rule options, etc.)
for (const d of result.configDiagnostics) console.log(d.ruleId, d.message)

// Severity overrides + per-rule options overrides
lint({
  paths: ["."],
  ruleOverrides: { "pyreon/no-classname": "off" },
  ruleOptionsOverrides: {
    "pyreon/no-window-in-ssr": { exemptPaths: ["src/foundation/"] },
  },
})`,
    notes:
      'Programmatic API. 59 rules across 12 categories. Auto-loads .pyreonlintrc.json. Presets: recommended, strict, app, lib. Per-rule options via tuple form in config (`["error", { exemptPaths: [...] }]`) or `ruleOptionsOverrides`. Wrong-typed options surface on `result.configDiagnostics`. Uses oxc-parser with AST caching.',
  },

  'lint/lintFile': {
    signature:
      'lintFile(filePath: string, sourceText: string, rules: Rule[], config: LintConfig, cache?: AstCache, configDiagnosticsSink?: ConfigDiagnostic[]): LintFileResult',
    example: `import { lintFile, allRules, getPreset, AstCache } from "@pyreon/lint"

const cache = new AstCache()
const config = getPreset("recommended")
const configSink: ConfigDiagnostic[] = []
const result = lintFile("app.tsx", source, allRules, config, cache, configSink)`,
    notes:
      'Low-level single-file API. Optional AstCache for repeat runs (FNV-1a hash keyed). Optional `configDiagnosticsSink` collects malformed-option diagnostics; without it they print to stderr.',
  },

  'lint/cli': {
    signature:
      'pyreon-lint [--preset name] [--fix] [--format text|json|compact] [--quiet] [--watch] [--list] [--config path] [--ignore path] [--rule id=severity] [--rule-options id=\'{json}\'] [path...]',
    example: `pyreon-lint --preset strict --quiet    # CI mode
pyreon-lint --fix                       # auto-fix
pyreon-lint --watch src/                # watch mode
pyreon-lint --list                      # list all 59 rules
pyreon-lint --format json               # machine-readable
pyreon-lint --rule-options 'pyreon/no-window-in-ssr={"exemptPaths":["src/foundation/"]}' src/`,
    notes:
      "CLI entry. Config: .pyreonlintrc.json (reference schema/pyreonlintrc.schema.json for IDE autocomplete), package.json 'pyreonlint' field. Ignore: .pyreonlintignore + .gitignore. Watch: fs.watch recursive with 100ms debounce. `--rule-options id='{json}'` passes per-rule options on a single run.",
  },

  'lint/no-process-dev-gate': {
    signature: 'rule: pyreon/no-process-dev-gate (architecture, error, auto-fixable)',
    example: `// ❌ Wrong — dead code in real Vite browser bundles
const __DEV__ = typeof process !== 'undefined' && process.env.NODE_ENV !== 'production'
if (__DEV__) console.warn('hello')

// ✅ Correct — Vite literal-replaces import.meta.env.DEV at build time
// @ts-ignore — provided by Vite/Rolldown at build time
const __DEV__ = import.meta.env?.DEV === true
if (__DEV__) console.warn('hello')`,
    notes:
      "The `typeof process !== 'undefined' && process.env.NODE_ENV !== 'production'` pattern works in vitest (Node, `process` is defined) but is silently dead code in real Vite browser bundles because Vite does NOT polyfill `process` for the client. Every `console.warn` gated on the broken constant never fires for real users in dev mode — unit tests pass while users get nothing. Use `import.meta.env.DEV` instead — Vite/Rolldown literal-replace it at build time, prod tree-shakes the warning to zero bytes, and vitest sets it to `true` automatically. Server-only packages (`zero`, `core/server`, `core/runtime-server`, `vite-plugin`, `cli`, `lint`, `mcp`, `storybook`, `typescript`) and test files are exempt. Reference implementation: `packages/fundamentals/flow/src/layout.ts:warnIgnoredOptions`. The rule has an auto-fix that replaces the broken expression with `import.meta.env?.DEV === true`.",
    mistakes: `- Copying the \`typeof process !== 'undefined' && process.env.NODE_ENV !== 'production'\` pattern from existing codebases — it works in Node but is dead in browser bundles
- Trying to test with \`delete globalThis.process\` — vitest's own \`import.meta.env\` depends on \`process\`, so deleting it breaks the FIXED gate too (not because the gate is wrong, but because vitest can't resolve it)
- Adding \`process: { env: { ... } }\` polyfills to vite.config.ts as a workaround — fix the source instead
- Using the rule for server-only packages — they're correctly exempt because Node always has \`process\``,
  },

  'lint/require-browser-smoke-test': {
    signature: 'rule: pyreon/require-browser-smoke-test (architecture, error in recommended/strict/lib, off in app)',
    example: `// Per-package config (optional — defaults cover all known browser packages)
{
  "rules": {
    "pyreon/require-browser-smoke-test": [
      "error",
      {
        "additionalPackages": ["@my-org/my-browser-pkg"],
        "exemptPaths": ["packages/experimental/"]
      }
    ]
  }
}`,
    notes:
      "Locks in the durability of the T1.1 browser smoke harness (PRs #224, #227, #229, #231). Every browser-categorized package MUST ship at least one \`*.browser.test.{ts,tsx}\` file under \`src/\`. Without this rule, new browser packages can quietly ship without smoke coverage and we drift back to the world before T1.1 — happy-dom silently masks environment-divergence bugs (PR #197 mock-vnode metadata drop, PR #200 \`typeof process\` dead code, multi-word event delegation bug). Default browser-package list mirrors \`.claude/rules/test-environment-parity.md\`. The rule fires once per package on its \`src/index.ts\`, walks the package directory looking for \`*.browser.test.*\`, and reports if none are found. Off in \`app\` preset because apps don't ship as packages with smoke obligations.",
    mistakes: `- Adding a new browser-running package without a browser test — the rule will fail your PR
- Hardcoding the browser-package list in the rule — the list lives in \`.claude/rules/browser-packages.json\` (single source of truth), not in the rule source
- Disabling the rule globally — use \`exemptPaths\` to exempt specific packages still under construction
- Shipping a \`sanity.browser.test.ts\` with \`expect(1).toBe(1)\` just to satisfy the rule — it passes but provides zero signal. The rule is a GATE, not a quality check; review actual contents on PR`,
  },

  'mcp/get_browser_smoke_status': {
    signature: 'tool: get_browser_smoke_status — no args',
    example: `// Ask the MCP server:
//   "which Pyreon packages are missing browser smoke coverage?"
// Tool walks packages/, matches against .claude/rules/browser-packages.json,
// returns a coverage report.`,
    notes:
      "Companion to the `pyreon/require-browser-smoke-test` lint rule. Reports which browser-categorized Pyreon packages have at least one `*.browser.test.{ts,tsx}` file under `src/`. Uses the same `.claude/rules/browser-packages.json` single source of truth as the rule + the CI script. Lets an AI agent check coverage before writing a new browser package (so it adds a smoke test in the same PR) instead of discovering the failure when CI runs. Falls back with a clear message if the JSON isn't present (e.g. consumer apps that don't ship the Pyreon monorepo layout).",
    mistakes: `- Using the tool's output as a substitute for running the CI script — this tool only checks file existence, not the self-expiring-exemption check that \`bun run lint:browser-smoke\` performs`,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // @pyreon/ui-core
  // ═══════════════════════════════════════════════════════════════════════════

  'ui-core/PyreonUI': {
    signature:
      "PyreonUI(props: { theme?: Theme; mode?: 'light' | 'dark' | 'system'; inversed?: boolean; children: VNodeChild }): VNodeChild",
    example: `import { PyreonUI } from "@pyreon/ui-core"
import { enrichTheme } from "@pyreon/unistyle"

const theme = enrichTheme({ colors: { primary: "#3b82f6" } })

<PyreonUI theme={theme} mode="system">
  <App />
</PyreonUI>

// mode="system" auto-detects OS dark mode via prefers-color-scheme
// inversed flips the resolved mode (light↔dark)`,
    notes:
      "Unified provider replacing 3 separate providers (theme, mode, config). Calls init() internally. mode='system' uses matchMedia('(prefers-color-scheme: dark)') and reactively updates.",
    mistakes: `- Using ThemeProvider + ModeProvider + ConfigProvider separately → Use PyreonUI instead
- Forgetting enrichTheme() → raw theme objects miss default breakpoints/spacing`,
  },

  'ui-core/useMode': {
    signature: "useMode(): Signal<'light' | 'dark'>",
    example: `import { useMode } from "@pyreon/ui-core"

const mode = useMode()
// mode() returns "light" or "dark" (resolved, reactive)
// Reflects OS preference when PyreonUI mode="system"`,
    notes:
      "Returns the resolved mode as a reactive signal. When mode='system', reflects the OS preference. When inversed is true, the mode is flipped.",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // @pyreon/unistyle
  // ═══════════════════════════════════════════════════════════════════════════

  'unistyle/enrichTheme': {
    signature: 'enrichTheme(theme: PartialTheme): Theme',
    example: `import { enrichTheme } from "@pyreon/unistyle"

const theme = enrichTheme({
  colors: { primary: "#3b82f6", secondary: "#6366f1" },
  fonts: { body: "Inter, sans-serif" },
})

// Merges user overrides with default breakpoints, spacing, and units`,
    notes:
      'Merges a partial theme with the full default theme (breakpoints, spacing, unit utilities). Always use when passing a theme to PyreonUI.',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // @pyreon/storybook
  // ═══════════════════════════════════════════════════════════════════════════

  // ═══════════════════════════════════════════════════════════════════════════
  // @pyreon/rx
  // ═══════════════════════════════════════════════════════════════════════════

  // <gen-docs:api-reference:start @pyreon/rx>

  'rx/rx': {
    signature: 'Readonly<{ filter, map, sortBy, groupBy, keyBy, uniqBy, take, skip, last, chunk, flatten, find, mapValues, first, compact, reverse, partition, takeWhile, dropWhile, unique, sample, count, sum, min, max, average, reduce, every, some, distinct, scan, combine, zip, merge, debounce, throttle, search, pipe }>',
    example: `const active = rx.filter(users, u => u.active)      // Computed<User[]>
const sorted = rx.sortBy(active, 'name')             // Computed<User[]>
const total = rx.sum(users, u => u.age)              // Computed<number>
const grouped = rx.groupBy(users, u => u.department) // Computed<Map<string, User[]>>`,
    notes: 'Namespaced object exposing all 37 reactive transform functions plus `pipe`. Use `rx.filter(...)` for dot-notation style, or destructure individual functions for tree-shaking. Every function is overloaded: `Signal<T[]>` input produces `Computed<T[]>` that auto-tracks, plain `T[]` input produces a static result. See also: pipe, filter.',
    mistakes: `- Expecting \`rx.filter(signal, pred)\` to return a plain array — signal inputs always produce \`Computed\` outputs. Call the result to read: \`active()\`
- Passing a signal accessor (\`() => items()\`) instead of the signal itself — pass \`items\` not \`() => items()\`; the function checks for \`.subscribe\` to detect signals`,
  },

  'rx/pipe': {
    signature: '<T>(source: Signal<T[]> | T[], ...operators: Operator[]) => Computed<T[]> | T[]',
    example: `const result = pipe(
  users,
  filter(u => u.active),
  sortBy('name'),
  map(u => u.name),
  take(10),
)
// Computed<string[]> when users is a signal`,
    notes: 'Compose transforms left-to-right. Each operator receives the output of the previous one. Signal source produces a reactive `Computed` that re-derives when the source changes. Use curried forms of individual functions as operators: `filter(pred)`, `sortBy(key)`, `map(fn)`, etc. See also: rx.',
    mistakes: '- Calling the non-curried form inside pipe — `pipe(users, filter(users, pred))` is wrong; use the curried form: `pipe(users, filter(pred))`',
  },

  'rx/filter': {
    signature: '<T>(source: Signal<T[]> | T[], predicate: (item: T) => boolean) => Computed<T[]> | T[]',
    example: `const evens = filter(items, n => n % 2 === 0)  // Computed<number[]>
const result = filter([1, 2, 3, 4, 5], n => n > 3)  // [4, 5]`,
    notes: 'Filter items by predicate. Signal input produces a reactive `Computed<T[]>` that re-evaluates when the source signal changes. Also available in curried form `filter(pred)` for use with `pipe()`. See also: rx, pipe.',
  },
  // <gen-docs:api-reference:end @pyreon/rx>

  // ═══════════════════════════════════════════════════════════════════════════
  // @pyreon/toast
  // ═══════════════════════════════════════════════════════════════════════════

  // <gen-docs:api-reference:start @pyreon/toast>

  'toast/toast': {
    signature: '(message: string, options?: ToastOptions) => string',
    example: `// Basic:
toast('Hello!')
const id = toast.success('Saved!')

// Loading → success:
const loadId = toast.loading('Saving...')
await save()
toast.update(loadId, { type: 'success', message: 'Done!' })

// Promise helper:
toast.promise(fetchData(), {
  loading: 'Loading...',
  success: 'Loaded!',
  error: 'Failed',
})

// Dismiss:
toast.dismiss(id)  // one
toast.dismiss()    // all`,
    notes: 'Create a toast notification imperatively. Returns the toast ID for later `update()` or `dismiss()`. Works from anywhere in the app — no context or provider needed. The function also exposes `.success()`, `.error()`, `.warning()`, `.info()`, `.loading()` preset methods, `.update(id, options)` for modifying existing toasts, `.dismiss(id?)` for removal, and `.promise(promise, messages)` for async operation tracking. See also: Toaster.',
    mistakes: `- Forgetting to render \`<Toaster />\` — toasts are created but have no visual container to render into
- Calling \`toast.update()\` after the toast has been auto-dismissed — the ID is no longer valid, the update is silently ignored
- Using \`toast.promise()\` with a function instead of a promise — pass the promise directly, not \`() => fetch(...)\``,
  },

  'toast/Toaster': {
    signature: '(props?: ToasterProps) => VNodeChild',
    example: '<Toaster position="top-right" duration={5000} />',
    notes: 'Render container for toast notifications. Mount once at the app root. Renders via Portal with CSS transitions, auto-dismiss timer, and pause-on-hover behavior. Position configurable via `position` prop (`top-right`, `top-left`, `bottom-right`, `bottom-left`, `top-center`, `bottom-center`). Duration configurable via `duration` prop (default 4000ms). See also: toast.',
    mistakes: `- Mounting multiple \`<Toaster />\` instances — toasts render in all of them, causing duplicates
- Conditional rendering of \`<Toaster />\` — if unmounted, toasts created via \`toast()\` are queued but invisible until the Toaster mounts`,
  },
  // <gen-docs:api-reference:end @pyreon/toast>

  // ═══════════════════════════════════════════════════════════════════════════
  // @pyreon/url-state
  // ═══════════════════════════════════════════════════════════════════════════

  // <gen-docs:api-reference:start @pyreon/url-state>

  'url-state/useUrlState': {
    signature: '<T>(key: string, defaultValue: T, options?: UrlStateOptions) => UrlStateSignal<T>',
    example: `// Single param:
const page = useUrlState('page', 1)
page()        // 1
page.set(2)   // URL → ?page=2

// Schema mode:
const { q, sort } = useUrlState({ q: '', sort: 'name' })
q.set('hello')  // ?q=hello&sort=name

// Array with repeated keys:
const tags = useUrlState('tags', [] as string[], { arrayFormat: 'repeat' })
tags.set(['a', 'b'])  // ?tags=a&tags=b`,
    notes: 'Create a reactive signal synced to a URL search parameter. Type is inferred from the default value — numbers, booleans, strings, and arrays are auto-coerced. Uses `replaceState` by default (no history entries). Returns a `UrlStateSignal<T>` with `.set()`, `.reset()`, and `.remove()`. Schema mode overload: `useUrlState({ page: 1, sort: "name" })` creates multiple synced signals from a single call. SSR-safe — reads from the request URL on server. See also: setUrlRouter.',
    mistakes: `- Using pushState behavior (adds history entries per keystroke) — useUrlState defaults to replaceState; if you pass \`{ replaceState: false }\` on a high-frequency input, the browser back button breaks
- Forgetting the default value — the type is inferred from it and determines the auto-coercion strategy (number default = coerce to number, boolean default = coerce to boolean)
- Reading useUrlState in a non-reactive scope at component setup — the signal reads the URL once; wrap in a reactive scope to track URL changes
- Calling setUrlRouter before the router is available — SSR renders may not have a router instance yet`,
  },

  'url-state/setUrlRouter': {
    signature: '(router: UrlRouter) => void',
    example: `import { useRouter } from '@pyreon/router'
import { setUrlRouter } from '@pyreon/url-state'

const router = useRouter()
setUrlRouter(router)
// Now useUrlState uses router.replace() internally`,
    notes: `Configure useUrlState to use a @pyreon/router instance for URL updates instead of raw \`history.replaceState\`. When set, URL changes go through the router's navigation system, ensuring route guards, middleware, and scroll management integrate correctly. See also: useUrlState.`,
  },
  // <gen-docs:api-reference:end @pyreon/url-state>

  // ═══════════════════════════════════════════════════════════════════════════
  // @pyreon/document-primitives
  // ═══════════════════════════════════════════════════════════════════════════

  'document-primitives/extractDocNode': {
    signature: 'extractDocNode(templateFn: () => VNode, options?: ExtractOptions): DocNode',
    example: `import {
  DocDocument, DocPage, DocHeading, DocText,
  extractDocNode,
} from '@pyreon/document-primitives'
import { download } from '@pyreon/document'

interface Resume { name: string; headline: string }

function ResumeTemplate(props: { resume: () => Resume }) {
  return (
    // title and author accept reactive accessors — extractDocNode
    // resolves them at extraction time, so each export click reads
    // the LIVE value from the underlying signal
    <DocDocument
      title={() => \`\${props.resume().name} — Resume\`}
      author={() => props.resume().name}
    >
      <DocPage>
        <DocHeading level="h1">{() => props.resume().name}</DocHeading>
        <DocText>{() => props.resume().headline}</DocText>
      </DocPage>
    </DocDocument>
  )
}

// One-step extraction. The two-step createDocumentExport(...).getDocNode()
// form is still exported for callers that want to pass the helper
// object around, but extractDocNode is the recommended form.
const tree = extractDocNode(() => <ResumeTemplate resume={store.resume} />)
await download(tree, 'resume.pdf')
await download(tree, 'resume.docx')
await download(tree, 'resume.html')
await download(tree, 'resume.md')`,
    notes:
      "18 primitives: DocDocument, DocPage, DocSection, DocRow, DocColumn, DocHeading, DocText, DocLink, DocImage, DocTable, DocList, DocListItem, DocCode, DocDivider, DocSpacer, DocButton, DocQuote, DocPageBreak. Same component tree renders in browser AND exports — primitives carry _documentType statics that extractDocumentTree (from @pyreon/connector-document) walks to produce a DocNode for @pyreon/document's render() to consume. DocDocument's title/author/subject accept either a string OR a `() => string` accessor; function values are stored in _documentProps and resolved at extraction time so reactive metadata works without `const initial = get()` workarounds. PR #197 also fixed a latent bug in extractDocumentTree: it now CALLS rocketstyle component functions to read post-attrs _documentProps, where before it only looked at the JSX vnode's props directly — every primitive's metadata was silently dropped during export until that fix landed.",
    mistakes: `- Calling props.title() at the top of a template body to "fix" reactivity — components run ONCE at mount, so this captures the initial value forever. Pass the accessor through to DocDocument as-is: <DocDocument title={() => get().name}>
- DocRow direction: layout props (direction, gap) go in .attrs() not .theme(). Element accepts 'inline' | 'rows' | 'reverseInline' | 'reverseRows' — 'row' is NOT valid
- For text children reactivity, pass a signal accessor and read inside body: <DocText>{() => store.field()}</DocText>
- Don't declare runtime-filled fields (tag, _documentProps) in the rocketstyle .attrs<P>() generic — they leak as required JSX props
- Using createDocumentExport(...).getDocNode() in new code — prefer extractDocNode(fn) which is one call instead of two. createDocumentExport is kept for backward compat`,
  },

  'document-primitives/createDocumentExport': {
    signature:
      'createDocumentExport(templateFn: () => VNode): { getDocNode(): DocNode }',
    example: `// Two-step form (kept for backward compat). New code should
// prefer the one-step extractDocNode helper.
import { createDocumentExport } from '@pyreon/document-primitives'

const helper = createDocumentExport(() => <Resume name="Aisha" />)
const tree = helper.getDocNode()`,
    notes:
      "Wrapper around extractDocNode. The wrapper-object form is kept for callers that want to pass the helper around (e.g. to wrapper components that take a DocumentExport instance). New code should use extractDocNode(templateFn) which is one call instead of two.",
  },
}
