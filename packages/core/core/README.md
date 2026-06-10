# @pyreon/core

Component model, JSX runtime, lifecycle, context, and control-flow components for Pyreon.

`@pyreon/core` provides `h()`, the JSX automatic runtime, lifecycle hooks (`onMount`/`onUnmount`/`onUpdate`/`onErrorCaptured`), a two-tier context system (static vs reactive), control-flow components (`Show`, `Switch`/`Match`, `For`, `Suspense`, `ErrorBoundary`, `Portal`, `Dynamic`), code-splitting via `lazy()`, and props utilities that preserve reactivity through HOC pipelines. **Components run ONCE** — re-rendering on signal change is not the model; reactivity is per-binding via accessors read inside JSX text thunks, effects, or computeds. Sits one layer above `@pyreon/reactivity` and is consumed by both `runtime-dom` (CSR) and `runtime-server` (SSR).

## Install

```bash
bun add @pyreon/core @pyreon/reactivity
```

## TypeScript / JSX setup

In your `tsconfig.json`:

```json
{
  "compilerOptions": {
    "jsx": "preserve",
    "jsxImportSource": "@pyreon/core"
  }
}
```

The compiler (`@pyreon/compiler`, via `@pyreon/vite-plugin`) then transforms JSX into `_tpl()` + `_bind()` templates against this runtime.

## Quick start

```tsx
import {
  onMount, createContext, createReactiveContext, provide, useContext,
  Show, Switch, Match, For, Suspense, ErrorBoundary, lazy,
} from '@pyreon/core'
import { signal } from '@pyreon/reactivity'

const ModeCtx = createReactiveContext<'light' | 'dark'>('light')

function Timer() {
  const count = signal(0)
  onMount(() => {
    const id = setInterval(() => count.update(n => n + 1), 1000)
    return () => clearInterval(id)
  })
  return <div>{() => count()}</div>
}

function Page(props: { items: { id: number; name: string }[] }) {
  const mode = signal<'light' | 'dark'>('dark')
  provide(ModeCtx, () => mode())

  return (
    <Switch fallback={<p>None</p>}>
      <Match when={() => props.items.length > 0}>
        <For each={props.items} by={i => i.id}>{i => <li>{i.name}</li>}</For>
      </Match>
    </Switch>
  )
}

const Heavy = lazy(() => import('./Heavy'))
function App() {
  return (
    <ErrorBoundary fallback={(e) => <p>{String(e)}</p>}>
      <Suspense fallback={<div>Loading…</div>}>
        <Heavy />
      </Suspense>
    </ErrorBoundary>
  )
}
```

## The reactive-vs-static rule

Components run once. What's reactive depends on **where** you read a signal:

```tsx
// REACTIVE — compiler wraps DOM text in an accessor
<div>{name()}</div>

// REACTIVE — explicit accessor
<div>{() => `Hi ${name()}`}</div>

// REACTIVE — props read inside a reactive scope
<Comp title={name()} />

// STATIC — destructured at component setup, captured once
const { items } = props
return <For each={items} ...>...</For>   // items is frozen at first read

// REACTIVE — read live
return <For each={props.items} ...>...</For>
```

`const x = props.y` IS reactive: the compiler inlines `props.y` back at the use site when `x` is a `const`. `let x = props.y` is static (mutable, not safe to inline).

## Lifecycle

```tsx
onMount(() => {
  const ws = new WebSocket(url)
  return () => ws.close()  // cleanup runs on unmount
})

onUnmount(() => { /* … */ })
onUpdate(() => { /* … */ })
onErrorCaptured((err, info) => { /* return true to stop propagation */ })
```

`onMount`'s return value is the cleanup function — there's no separate `useEffect`-style pair. Hook arrays are lazy-allocated; components with no hooks pay zero cost.

## Context

Two flavors, deliberately distinct:

```tsx
// Static context: useContext returns T directly, safe to destructure
const ThemeCtx = createContext<'light' | 'dark'>('light')
const theme = useContext(ThemeCtx)  // 'light' | 'dark'

// Reactive context: useContext returns () => T, call it inside reactive scopes
const ModeCtx = createReactiveContext<'light' | 'dark'>('light')
const getMode = useContext(ModeCtx)
return <div>{() => getMode()}</div>
```

`provide(ctx, value)` pushes a context frame and auto-cleans up on unmount. `withContext(ctx, value, fn)` is the bounded form for non-component scopes.

## Control flow

```tsx
<Show when={isReady()}>{() => <Page />}</Show>
<Show when={count} fallback={<Loading />}>{(n) => <p>{n}</p>}</Show>

<Switch fallback={<NotFound />}>
  <Match when={isAdmin()}><AdminPanel /></Match>
  <Match when={isUser()}><UserPanel /></Match>
</Switch>

<For each={items} by={item => item.id}>
  {(item) => <li>{item.name}</li>}
</For>

<Portal mount={document.body}><Modal /></Portal>
<Dynamic component={tag()} {...props} />
<Defer>{() => <Heavy />}</Defer>   // mount after first paint
```

`<For>` uses **`by`** (not `key`) — JSX reserves `key` as a VNode reconciliation prop. `Show` / `Match` accept either a value (`when={isOpen()}`) or an accessor (`when={() => isOpen()}`) — both work, but only the accessor form re-evaluates on signal change.

## Suspense + lazy

```tsx
const Heavy = lazy(() => import('./Heavy'))

<Suspense fallback={<div>Loading…</div>}>
  <Heavy />
</Suspense>
```

`lazy()` integrates with `Suspense` — async work inside the lazy module pauses rendering until resolved. SSR streams the fallback then patches in the resolved subtree.

## Props utilities

```tsx
import { splitProps, mergeProps, cx, createUniqueId } from '@pyreon/core'

function Button(props: ButtonProps) {
  const [local, rest] = splitProps(props, ['variant', 'size'])
  const merged = mergeProps({ type: 'button' }, rest)
  const id = createUniqueId()  // 'pyreon-1', SSR-safe
  return (
    <button id={id} {...merged} class={cx('btn', `btn-${local.variant}`, local.size && `size-${local.size}`)}>
      {props.children}
    </button>
  )
}
```

`splitProps` and `mergeProps` copy property **descriptors** (not values), so getter-shaped reactive props survive. Plain `result[key] = source[key]` fires the getter at copy time and collapses reactivity — use these helpers instead.

## ErrorBoundary

```tsx
<ErrorBoundary fallback={(err, reset) => (
  <div role="alert">
    <p>{String(err)}</p>
    <button onClick={reset}>Retry</button>
  </div>
)}>
  <App />
</ErrorBoundary>
```

Captures any error thrown in descendants. Pair with `registerErrorHandler` / `reportError` for telemetry.

## Compiler-emitted helpers

`_rp(fn)`, `_wrapSpread(source)`, `makeReactiveProps(raw)`, `REACTIVE_PROP` — emitted by `@pyreon/compiler` and consumed by `runtime-dom` / `runtime-server`. Not user-facing in normal code. If you write a manual HOC pipeline that copies props in plain JS (not via JSX spread), reach for `splitProps`/`mergeProps` — descriptor preservation is load-bearing for reactivity.

`nativeCompat(Component)` — marker that tells `@pyreon/{react,preact,vue,solid}-compat` jsx() runtimes to route the component through `h(type, props)` directly, skipping the compat wrapper. Only relevant for hand-rolled Pyreon-flavored helpers used inside compat-mode apps.

## Common conventions

- `class`, not `className`
- `for`, not `htmlFor`
- `onInput`, not `onChange`, for per-keystroke input updates
- `style={{ … }}` accepts a CSS-object; `style="…"` accepts a CSS string
- `data-*` / `aria-*` attributes typed via template-literal index signatures (catches typos)

## Documentation

Full docs: [docs.pyreon.dev/docs/core](https://docs.pyreon.dev/docs/core) (or `docs/src/content/docs/core.md` in this repo).

## License

MIT
