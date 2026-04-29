import { defineManifest } from '@pyreon/manifest'

export default defineManifest({
  name: '@pyreon/core',
  title: 'Complete API',
  tagline:
    'VNode, h(), Fragment, lifecycle, context, JSX runtime, Suspense, ErrorBoundary, lazy(), Dynamic, cx(), splitProps, mergeProps, createUniqueId',
  description:
    'Component model and lifecycle for Pyreon. Provides the VNode type system, `h()` hyperscript function, JSX automatic runtime (`@pyreon/core/jsx-runtime`), lifecycle hooks (`onMount`, `onUnmount`), two-tier context system (`createContext` for static values, `createReactiveContext` for signal-backed values), control-flow components (`Show`, `Switch`/`Match`, `For`, `Suspense`, `ErrorBoundary`), code-splitting via `lazy()`, dynamic rendering via `Dynamic`, and props utilities (`splitProps`, `mergeProps`, `cx`, `createUniqueId`). Components are plain functions (`ComponentFn<P> = (props: P) => VNodeChild`) that run ONCE — reactivity comes from reading signals inside reactive scopes, not from re-running the component.',
  category: 'universal',
  longExample: `import { h, Fragment, onMount, onUnmount, provide, createContext, createReactiveContext, useContext, Show, Switch, Match, For, Suspense, ErrorBoundary, lazy, Dynamic, cx, splitProps, mergeProps, createUniqueId, untrack } from "@pyreon/core"
import { signal, computed } from "@pyreon/reactivity"

// Context — static (destructure-safe) vs reactive (must call to read)
const ThemeCtx = createContext<"light" | "dark">("light")
const ModeCtx = createReactiveContext<"light" | "dark">("light")

const App = (props: { children: any }) => {
  const mode = signal<"light" | "dark">("dark")
  provide(ThemeCtx, "dark")                    // static — safe to destructure
  provide(ModeCtx, () => mode())               // reactive — consumer must call

  return <>{props.children}</>
}

// Lifecycle
const Timer = () => {
  const count = signal(0)
  onMount(() => {
    const id = setInterval(() => count.update(n => n + 1), 1000)
    return () => clearInterval(id)  // cleanup runs on unmount
  })
  return <div>{() => count()}</div>
}

// Control flow — reactive conditional rendering
const Page = (props: { items: { id: number; name: string }[]; loggedIn: () => boolean }) => (
  <div>
    <Show when={props.loggedIn()} fallback={<p>Please log in</p>}>
      <For each={props.items} by={item => item.id}>
        {item => <li>{item.name}</li>}
      </For>
    </Show>
  </div>
)

// Props utilities — preserve reactivity
const Button = (props: { class?: string; size?: string; onClick: () => void; children: any }) => {
  const [local, rest] = splitProps(props, ["class", "size"])
  const merged = mergeProps({ size: "md" }, local)
  const id = createUniqueId()
  return <button id={id} {...rest} class={cx("btn", \`btn-\${merged.size}\`, local.class)} />
}

// Code splitting
const HeavyPage = lazy(() => import("./HeavyPage"))
const LazyApp = () => (
  <Suspense fallback={<div>Loading...</div>}>
    <HeavyPage />
  </Suspense>
)`,
  features: [
    'h() — hyperscript function producing VNodes, JSX compiles to h() or _tpl()',
    'Fragment — group children without a wrapper DOM element',
    'onMount / onUnmount — lifecycle hooks, onMount supports cleanup return',
    'createContext / createReactiveContext — two-tier context system',
    'provide / useContext — push and read context values',
    'Show / Switch+Match — reactive conditional rendering',
    'For — keyed reactive list rendering with by prop',
    'Suspense / ErrorBoundary — async and error boundaries',
    'lazy() / Dynamic — code splitting and dynamic component rendering',
    'splitProps / mergeProps — reactivity-preserving props utilities',
    'cx() — class value combiner (strings, objects, arrays, nested)',
    'createUniqueId — SSR-safe unique ID generation',
  ],
  api: [
    {
      name: 'h',
      kind: 'function',
      signature:
        'h<P extends Props>(type: ComponentFn<P> | string | symbol, props: P | null, ...children: VNodeChild[]): VNode',
      summary:
        'Create a VNode from a component function, HTML tag string, or symbol (Fragment, Portal). Low-level API — prefer JSX which compiles to `h()` calls (or `_tpl()` + `_bind()` for template-optimized paths). Children are stored in `vnode.children`; components must merge them via `props.children = vnode.children.length === 1 ? vnode.children[0] : vnode.children`.',
      example: `const vnode = h("div", { class: "container" },
  h("h1", null, "Hello"),
  h(Counter, { initial: 0 })
)`,
      mistakes: [
        '`h("div", "text")` — second arg is always props (or null). Text children go in the third+ positions: `h("div", null, "text")`',
        '`h(MyComponent, { children: <span /> })` — children go as rest args, not a prop: `h(MyComponent, null, <span />)`',
        '`h("input", { className: "x" })` — use `class` not `className` (Pyreon uses standard HTML attributes)',
        '`h("input", { onChange: handler })` — use `onInput` for keypress-by-keypress updates (native DOM events)',
      ],
      seeAlso: ['Fragment', 'Dynamic', 'lazy'],
    },
    {
      name: 'Fragment',
      kind: 'constant',
      signature: 'Fragment: symbol',
      summary:
        'Symbol used as the type for fragment VNodes that group children without producing a wrapper DOM element. In JSX, `<>...</>` compiles to `h(Fragment, null, ...)`. Useful when a component needs to return multiple sibling elements.',
      example: `// JSX:
<>
  <h1>Title</h1>
  <p>Content</p>
</>

// h() API:
h(Fragment, null, h("h1", null, "Title"), h("p", null, "Content"))`,
      seeAlso: ['h'],
    },
    {
      name: 'onMount',
      kind: 'function',
      signature: 'onMount(fn: () => CleanupFn | void): void',
      summary:
        'Register a callback that runs after the component mounts into the DOM. The callback can optionally return a cleanup function that runs on unmount — this is the idiomatic pattern for event listeners, timers, and subscriptions. Must be called during component setup (the synchronous function body), not inside effects or async callbacks.',
      example: `const Timer = () => {
  const count = signal(0)

  onMount(() => {
    const id = setInterval(() => count.update(n => n + 1), 1000)
    return () => clearInterval(id)  // cleanup on unmount
  })

  return <div>{() => count()}</div>
}`,
      mistakes: [
        'Forgetting cleanup: `onMount(() => { const id = setInterval(...) })` leaks the interval. Return cleanup: `return () => clearInterval(id)`',
        'Using `onMount` + separate `onUnmount` for paired setup/teardown — prefer returning cleanup from `onMount` instead',
        'Calling `onMount` inside an `effect()` or async callback — it only works during synchronous component setup',
        'Accessing DOM refs before mount — the callback runs AFTER mount, which is the right place for DOM measurements',
      ],
      seeAlso: ['onUnmount', 'onUpdate'],
    },
    {
      name: 'onUnmount',
      kind: 'function',
      signature: 'onUnmount(fn: () => void): void',
      summary:
        'Register a callback that runs when the component is removed from the DOM. For paired setup/teardown, prefer returning a cleanup function from `onMount` instead — it co-locates the cleanup with the setup. `onUnmount` is useful when cleanup needs to reference state computed separately from the mount callback.',
      example: `onUnmount(() => {
  console.log("Component removed from DOM")
})`,
      seeAlso: ['onMount'],
    },
    {
      name: 'onUpdate',
      kind: 'function',
      signature: 'onUpdate(fn: () => void): void',
      summary:
        'Register a callback that runs after the component updates (reactive dependencies change and DOM patches complete). Rarely needed — most update logic belongs in `effect()` or `computed()`. Useful for imperative DOM measurements that need to run after all reactive updates have flushed.',
      example: `onUpdate(() => {
  console.log("Component updated, DOM is current")
})`,
      seeAlso: ['onMount', 'onUnmount'],
    },
    {
      name: 'onErrorCaptured',
      kind: 'function',
      signature: 'onErrorCaptured(fn: (error: unknown) => boolean | void): void',
      summary:
        'Register an error handler that captures errors thrown by descendant components. Return `false` to prevent the error from propagating further up the tree. Works alongside `ErrorBoundary` for programmatic error handling.',
      example: `onErrorCaptured((error) => {
  console.error("Caught:", error)
  return false  // stop propagation
})`,
      seeAlso: ['ErrorBoundary'],
    },
    {
      name: 'createContext',
      kind: 'function',
      signature: 'createContext<T>(defaultValue: T): Context<T>',
      summary:
        'Create a static context. `useContext()` returns the value directly (`T`), so it is safe to destructure. Use this for values that do not change after being provided (theme name, locale string, config object). For values that change reactively (mode signal, locale signal), use `createReactiveContext` instead — otherwise consumers capture a stale snapshot at setup time.',
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
      mistakes: [
        '`provide(ThemeCtx, () => modeSignal())` with a static context — the consumer receives the function itself, not the signal value. Use `createReactiveContext` for dynamic values',
        'Destructuring a reactive context value: `const { mode } = useContext(reactiveCtx)` captures once. Keep the object reference and access lazily',
        'Calling `useContext` outside a component body — it reads from the component context stack, which only exists during setup',
      ],
      seeAlso: ['createReactiveContext', 'provide', 'useContext'],
    },
    {
      name: 'createReactiveContext',
      kind: 'function',
      signature: 'createReactiveContext<T>(defaultValue: T): ReactiveContext<T>',
      summary:
        'Create a reactive context. `useContext()` returns `() => T` — an accessor that must be called to read the current value. Use this for values that change over time (mode, locale, user). The accessor subscribes to updates when read inside reactive scopes (`effect()`, JSX thunks, `computed()`).',
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
      seeAlso: ['createContext', 'provide', 'useContext'],
    },
    {
      name: 'provide',
      kind: 'function',
      signature: 'provide<T>(ctx: Context<T> | ReactiveContext<T>, value: T): void',
      summary:
        'Push a context value for all descendant components. Auto-cleans up on unmount. Must be called during component setup (synchronous function body). Preferred over manual `pushContext`/`popContext`. For reactive values, provide a getter function to a `ReactiveContext`: `provide(ModeCtx, () => modeSignal())`.',
      example: `const ThemeCtx = createContext<"light" | "dark">("light")

function App() {
  provide(ThemeCtx, "dark")
  return <Child />
}`,
      mistakes: [
        '`provide(ctx, "static")` for a value that changes — use `createReactiveContext` + `provide(ctx, () => signal())`',
        'Calling `provide` inside `onMount` or `effect` — it must run during synchronous component setup',
        'Providing the same context twice in one component — the second `provide` shadows the first for that subtree',
      ],
      seeAlso: ['createContext', 'createReactiveContext', 'useContext'],
    },
    {
      name: 'useContext',
      kind: 'function',
      signature: 'useContext<T>(ctx: Context<T>): T',
      summary:
        'Read the nearest provided value for a context. For static `Context<T>`, returns `T` directly. For `ReactiveContext<T>`, returns `() => T` — must call the accessor to read. Falls back to the default value if no ancestor provides the context.',
      example: `const theme = useContext(ThemeContext)  // static: returns T
const getMode = useContext(ModeCtx)    // reactive: returns () => T`,
      seeAlso: ['provide', 'createContext', 'createReactiveContext'],
    },
    {
      name: 'Show',
      kind: 'component',
      signature: '<Show when={condition} fallback={alternative}>{children}</Show>',
      summary:
        'Reactive conditional rendering. Mounts children when `when` is truthy, unmounts and shows `fallback` when falsy. More efficient than ternary for signal-driven conditions because it avoids re-evaluating the entire branch expression on every signal change — `Show` only transitions between mounted/unmounted when the boolean flips. `when` accepts BOTH a value (`when={true}`, `when={signal()}`) and an accessor (`when={() => signal()}`) — the framework normalizes via `typeof === "function"`. The accessor form is required for true reactivity (the framework re-evaluates it on signal change); a bare `when={signal}` reference works because the compiler\'s signal auto-call rewrites it to `when={signal()}`.',
      example: `<Show when={isLoggedIn()} fallback={<LoginForm />}>
  <Dashboard />
</Show>`,
      mistakes: [
        '`{cond() ? <A /> : <B />}` — works but less efficient than `<Show>` for signal-driven conditions',
        '`<Show when={items().length}>` — works (truthy check), but be explicit: `<Show when={items().length > 0}>`',
        '`<Show when={signal}>` (bare reference) — relies on the compiler\'s signal auto-call to rewrite to `when={signal()}`. Works defensively but use `when={() => signal()}` for explicit accessor semantics across the entire reactive lifecycle.',
      ],
      seeAlso: ['Switch', 'Match', 'For'],
    },
    {
      name: 'Switch',
      kind: 'component',
      signature: '<Switch fallback={default}>{Match children}</Switch>',
      summary:
        'Multi-branch conditional rendering. Renders the first `<Match>` child whose `when` prop is truthy. If no match, renders the `fallback`. More readable than nested `<Show>` for multi-way conditions.',
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
      seeAlso: ['Match', 'Show'],
    },
    {
      name: 'Match',
      kind: 'component',
      signature: '<Match when={condition}>{children}</Match>',
      summary:
        'A branch inside a `<Switch>`. Renders its children when `when` is truthy and it is the first truthy `<Match>` in the parent `<Switch>`. Must be a direct child of `<Switch>`. `when` accepts both a value and an accessor (same normalization as `<Show>`).',
      example: `<Switch>
  <Match when={tab() === "home"}><Home /></Match>
  <Match when={tab() === "settings"}><Settings /></Match>
</Switch>`,
      seeAlso: ['Switch', 'Show'],
    },
    {
      name: 'For',
      kind: 'component',
      signature: '<For each={items} by={keyFn}>{renderFn}</For>',
      summary:
        'Keyed reactive list rendering. Uses the `by` prop (not `key`) for the key function because JSX extracts `key` as a special VNode reconciliation prop. The render function receives each item and its index. Internally uses an LIS-based reconciler for minimal DOM mutations when the list changes.',
      example: `const items = signal([
  { id: 1, name: "Apple" },
  { id: 2, name: "Banana" },
])

<For each={items()} by={item => item.id}>
  {(item, index) => <li>{item.name}</li>}
</For>`,
      mistakes: [
        '`<For each={items}>` — must call the signal: `<For each={items()}>`',
        '`<For each={items()} key={...}>` — use `by` not `key` (JSX reserves `key` for VNode reconciliation)',
        '`{items().map(...)}` — use `<For>` for reactive list rendering; `.map()` re-creates all DOM nodes on every change',
        '`<For each={items()} by={index}>` — using array index as key defeats the reconciler; use a stable identity like `item.id`',
      ],
      seeAlso: ['Show', 'mapArray'],
    },
    {
      name: 'Suspense',
      kind: 'component',
      signature: '<Suspense fallback={loadingUI}>{children}</Suspense>',
      summary:
        'Async boundary that shows `fallback` while any `lazy()` component or async child inside is loading. SSR mode streams the fallback immediately and swaps in the resolved content when ready (30s timeout). Nested Suspense boundaries are independent — an inner boundary resolving does not affect the outer.',
      example: `const LazyPage = lazy(() => import("./HeavyPage"))

<Suspense fallback={<div>Loading...</div>}>
  <LazyPage />
</Suspense>`,
      seeAlso: ['lazy', 'ErrorBoundary'],
    },
    {
      name: 'ErrorBoundary',
      kind: 'component',
      signature: '<ErrorBoundary onCatch={handler} fallback={errorUI}>{children}</ErrorBoundary>',
      summary:
        'Catches render errors thrown by descendant components. The `fallback` receives the error object for display. `onCatch` fires with the error for logging/telemetry. Without an ErrorBoundary, uncaught errors propagate to the nearest `registerErrorHandler` or crash the app.',
      example: `<ErrorBoundary
  onCatch={(err) => console.error(err)}
  fallback={(err) => <div>Error: {err.message}</div>}
>
  <App />
</ErrorBoundary>`,
      seeAlso: ['Suspense', 'onErrorCaptured'],
    },
    {
      name: 'lazy',
      kind: 'function',
      signature:
        'lazy(loader: () => Promise<{ default: ComponentFn }>, options?: LazyOptions): LazyComponent',
      summary:
        'Wrap a dynamic import for code splitting. Returns a component that integrates with `Suspense` — the parent Suspense boundary shows its fallback until the import resolves. The loaded component is cached after first resolution.',
      example: `const Settings = lazy(() => import("./pages/Settings"))

// Use in JSX (wrap with Suspense):
<Suspense fallback={<Spinner />}>
  <Settings />
</Suspense>`,
      seeAlso: ['Suspense', 'Dynamic'],
    },
    {
      name: 'Dynamic',
      kind: 'component',
      signature: '<Dynamic component={comp} {...props} />',
      summary:
        'Renders a component by reference or string tag name. Useful when the component to render is determined at runtime (tab panels, plugin systems, polymorphic containers). When `component` changes, the previous component unmounts and the new one mounts.',
      example: `const components = { home: HomePage, about: AboutPage }
const current = signal("home")

<Dynamic component={components[current()]} />`,
      seeAlso: ['lazy', 'h'],
    },
    {
      name: 'cx',
      kind: 'function',
      signature: 'cx(...values: ClassValue[]): string',
      summary:
        'Combine class values into a single string. Accepts strings, booleans (falsy values ignored), objects (`{ active: true }`), and arrays (nested). The `class` prop on JSX elements already accepts `ClassValue` directly, so explicit `cx()` is only needed when building class strings outside JSX or when composing values from multiple sources.',
      example: `cx("foo", "bar")                         // "foo bar"
cx("base", isActive && "active")         // conditional
cx({ base: true, active: isActive() })   // object syntax
cx(["a", ["b", { c: true }]])            // nested arrays

// class prop accepts ClassValue directly:
<div class={["base", cond && "active"]} />
<div class={{ base: true, active: isActive() }} />`,
      seeAlso: ['splitProps', 'mergeProps'],
    },
    {
      name: 'splitProps',
      kind: 'function',
      signature:
        'splitProps<T, K extends keyof T>(props: T, keys: K[]): [Pick<T, K>, Omit<T, K>]',
      summary:
        'Split a props object into two parts: the picked keys and the rest. Both halves preserve signal reactivity — reads through either half still track the original reactive prop getters. This is the Pyreon replacement for `const { x, ...rest } = props` destructuring, which captures values once and loses reactivity.',
      example: `const Button = (props: { class?: string; onClick: () => void; children: VNodeChild }) => {
  const [local, rest] = splitProps(props, ["class"])
  return <button {...rest} class={cx("btn", local.class)} />
}`,
      mistakes: [
        '`const { class: cls, ...rest } = props` — destructuring captures once, loses reactivity. Use `splitProps(props, ["class"])`',
        'Passing a non-props object — `splitProps` relies on reactive getter descriptors that the compiler creates on props objects',
        'Forgetting that symbol-keyed props are preserved — `splitProps` uses `Reflect.ownKeys` so symbols (like `REACTIVE_PROP`) survive',
      ],
      seeAlso: ['mergeProps', 'cx'],
    },
    {
      name: 'mergeProps',
      kind: 'function',
      signature: 'mergeProps<T extends object[]>(...sources: T): MergedProps<T>',
      summary:
        'Merge multiple props objects with last-source-wins semantics. Reads are lazy — the merged object delegates to the source objects via getters, so signal reactivity is preserved. Commonly used to inject default props: `mergeProps({ size: "md" }, props)`. Forces `configurable: true` on copied descriptors to prevent "Cannot redefine property" errors.',
      example: `const Button = (props: { size?: string; variant?: string }) => {
  const merged = mergeProps({ size: "md", variant: "primary" }, props)
  return <button class={\`btn-\${merged.size} btn-\${merged.variant}\`} />
}`,
      mistakes: [
        '`Object.assign({}, defaults, props)` — loses reactivity. Use `mergeProps(defaults, props)` instead',
        '`mergeProps(props, defaults)` — wrong order. Defaults go FIRST, actual props last (last source wins)',
      ],
      seeAlso: ['splitProps', 'cx'],
    },
    {
      name: 'createUniqueId',
      kind: 'function',
      signature: 'createUniqueId(): string',
      summary:
        'Generate a unique string ID ("pyreon-1", "pyreon-2", ...) that is consistent between server and client when called in the same order. SSR-safe — the counter resets per request context. Use for `id`/`for`/`aria-*` attribute pairing in components.',
      example: `const LabeledInput = (props: { label: string }) => {
  const id = createUniqueId()
  return (
    <>
      <label for={id}>{props.label}</label>
      <input id={id} />
    </>
  )
}`,
      seeAlso: ['splitProps'],
    },
    {
      name: 'Portal',
      kind: 'component',
      signature: '<Portal target={element}>{children}</Portal>',
      summary:
        'Render children into a DOM element outside the component tree (typically `document.body`). Useful for modals, tooltips, and overlays that need to escape parent overflow/z-index stacking contexts. Context values from the Portal source tree are preserved.',
      example: `<Portal target={document.body}>
  <div class="modal-overlay">
    <div class="modal">Content</div>
  </div>
</Portal>`,
      seeAlso: ['Dynamic'],
    },
    {
      name: 'mapArray',
      kind: 'function',
      signature: 'mapArray<T, U>(list: () => T[], mapFn: (item: T, index: () => number) => U): () => U[]',
      summary:
        'Low-level reactive array mapping used internally by `<For>`. Maps a reactive array signal through a transform function, caching results per item identity. Prefer `<For>` in JSX — use `mapArray` only when you need a reactive derived array outside of rendering.',
      example: `const items = signal([1, 2, 3])
const doubled = mapArray(() => items(), (item) => item * 2)
// doubled() → [2, 4, 6] — updates reactively`,
      seeAlso: ['For'],
    },
    {
      name: 'createRef',
      kind: 'function',
      signature: 'createRef<T>(): Ref<T>',
      summary:
        'Create a mutable ref object (`{ current: T | null }`) for holding DOM element references. Pass as the `ref` prop on JSX elements — the runtime sets `.current` after mount and clears it on unmount. Callback refs (`(el: T | null) => void`) are also supported via `RefProp<T>`.',
      example: `const inputRef = createRef<HTMLInputElement>()
onMount(() => inputRef.current?.focus())
return <input ref={inputRef} />`,
      seeAlso: ['onMount'],
    },
    {
      name: 'untrack',
      kind: 'function',
      signature: '(fn: () => T) => T',
      summary:
        'Execute a function reading signals WITHOUT subscribing to them. Alias for `runUntracked` from `@pyreon/reactivity`. Use inside effects when you need a one-shot snapshot of a signal value without the effect re-running when that signal changes.',
      example: `effect(() => {
  const current = count()        // tracked
  const other = untrack(() => otherSignal())  // NOT tracked
})`,
      seeAlso: ['@pyreon/reactivity'],
    },
    {
      name: 'nativeCompat',
      kind: 'function',
      signature: '<T>(fn: T) => T',
      summary:
        'Mark a Pyreon framework component as "self-managing" so compat layers (`@pyreon/{react,preact,vue,solid}-compat`) skip their wrapping and route the component through Pyreon\'s mount path. Use on every `@pyreon/*` JSX component whose setup body uses `provide()` / lifecycle hooks / signal subscriptions — wrapping breaks those by running the body inside the compat layer\'s render context instead of Pyreon\'s. Idempotent; non-function inputs pass through unchanged. The marker is a registry symbol (`Symbol.for("pyreon:native-compat")`), so framework and compat sides share it without an import dependency between them.',
      example: `// In a framework package:
export const RouterView = nativeCompat(function RouterView(props) {
  provide(RouterContext, ...)
  return <div>{children}</div>
})`,
      seeAlso: ['isNativeCompat', 'NATIVE_COMPAT_MARKER'],
      mistakes: [
        'Forgetting to mark a new framework JSX export — under compat mode, the component\'s `provide()` / `onMount()` calls fail with "called outside component setup" warnings and the rendered DOM silently breaks.',
        'Marking user-app components — only `@pyreon/*` framework components that already manage their own reactivity should be marked. User components in compat mode are SUPPOSED to be wrapped (that\'s how they get re-render-on-state-change semantics).',
      ],
    },
    {
      name: 'isNativeCompat',
      kind: 'function',
      signature: '(fn: unknown) => boolean',
      summary:
        'Compat-layer-side: read whether a function has been marked as a Pyreon native framework component via `nativeCompat()`. Compat `jsx()` calls this to decide whether to skip the React/Vue/Solid/Preact-style wrapping. Always returns `false` for non-function inputs.',
      example: `// In a compat layer's jsx-runtime:
if (isNativeCompat(type)) return h(type, props)
return wrapCompatComponent(type)(props)`,
      seeAlso: ['nativeCompat', 'NATIVE_COMPAT_MARKER'],
    },
    {
      name: 'NATIVE_COMPAT_MARKER',
      kind: 'constant',
      signature: 'symbol',
      summary:
        'The well-known registry symbol (`Symbol.for("pyreon:native-compat")`) used to mark a component as a Pyreon native framework component. Most callers should use `nativeCompat()` / `isNativeCompat()` instead of touching the symbol directly; exported for advanced cases (e.g., a compat layer that wants to inspect the property without going through the helper).',
      example: `import { NATIVE_COMPAT_MARKER } from '@pyreon/core'

// Equivalent to nativeCompat(MyComponent):
;(MyComponent as Record<symbol, boolean>)[NATIVE_COMPAT_MARKER] = true`,
      seeAlso: ['nativeCompat', 'isNativeCompat'],
    },
    {
      name: 'ExtractProps',
      kind: 'type',
      signature: 'type ExtractProps<T> = T extends ComponentFn<infer P> ? P : T',
      summary:
        'Extracts the props type from a `ComponentFn`. Passes through unchanged if `T` is not a `ComponentFn`. Useful for HOC patterns and typed wrappers that need to infer the wrapped component\'s prop interface.',
      example: `const Greet: ComponentFn<{ name: string }> = ({ name }) => <h1>{name}</h1>
type Props = ExtractProps<typeof Greet>  // { name: string }`,
      seeAlso: ['HigherOrderComponent'],
    },
    {
      name: 'HigherOrderComponent',
      kind: 'type',
      signature: 'type HigherOrderComponent<HOP, P> = ComponentFn<HOP & P>',
      summary:
        'Typed HOC pattern where `HOP` is the props the HOC adds and `P` is the wrapped component\'s own props. The resulting component accepts both sets of props.',
      example: `function withLogger<P>(Wrapped: ComponentFn<P>): HigherOrderComponent<{ logLevel?: string }, P> {
  return (props) => {
    console.log(\`[\${props.logLevel ?? "info"}] Rendering\`)
    return <Wrapped {...props} />
  }
}`,
      seeAlso: ['ExtractProps'],
    },
  ],
  gotchas: [
    {
      label: 'Components run once',
      note: 'Pyreon components are plain functions that execute a single time. Reactivity comes from reading signals inside reactive scopes (JSX expression thunks, `effect()`, `computed()`), not from re-running the component function. `if (!cond()) return null` at the top level runs once and is static — use `return (() => { if (!cond()) return null; return <div /> })` for reactive conditional rendering.',
    },
    {
      label: 'Destructuring props kills reactivity',
      note: '`const { name } = props` captures the value at setup time — it becomes static. Use `props.name` inside reactive scopes, or `splitProps(props, ["name"])` for rest patterns. The compiler handles `const x = props.y; return <div>{x}</div>` by inlining `props.y` back at the use site, but only for `const` (not `let`/`var`).',
    },
    {
      label: 'Two context types',
      note: '`createContext<T>` returns `T` from `useContext()` — safe to destructure. `createReactiveContext<T>` returns `() => T` — must call to read. Using the wrong one is a common source of stale-value bugs (static context for dynamic values) or unnecessary ceremony (reactive context for constants).',
    },
    {
      label: 'For uses by, not key',
      note: 'The `<For>` component uses the `by` prop for its key function because JSX extracts `key` as a special VNode reconciliation prop. Writing `<For each={items()} key={fn}>` silently passes the key to the VNode system instead of the list reconciler.',
    },
    {
      label: 'JSX uses standard HTML attributes',
      note: 'Use `class` not `className`, `for` not `htmlFor`, `onInput` not `onChange` for per-keystroke updates. Pyreon maps to native DOM events, not the React synthetic event system.',
    },
  ],
})
