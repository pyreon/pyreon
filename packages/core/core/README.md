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
  return <div>{count()}</div>
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
<div>{`Hi ${name()}`}</div>

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
return <div>{getMode()}</div>
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

## Async data

```tsx
import type { AsyncLike } from '@pyreon/core'

// Any source exposing isPending/isError/error/data satisfies AsyncLike<T> —
// a @pyreon/query result, a @pyreon/http resource, or a hand-rolled one.
declare const todos: AsyncLike<{ id: number; title: string }[]>

<Async of={todos} empty="No todos yet." error={(e) => <p>{String(e)}</p>}>
  {(rows) => <ul>{rows.map((r) => <li>{r.title}</li>)}</ul>}
</Async>
```

`<Async>` renders one of pending / error / empty / data instead of a hand-written guard chain, and re-evaluates on source change (same reactive-accessor shape as `Show`). `empty` covers both null/undefined data and an empty array — but only when you pass it: an empty array with no `empty` prop is handed to `children` instead, so a list that renders its own empty state keeps working.

There is **no default for `error`** — `<ErrorBoundary>` cannot catch it. A reactive re-run's throw happens outside the boundary's reach (only a throw during the *initial* mount is caught), which is exactly the common case: a request that fails after mount. Omitting `error` renders nothing and warns once in development; pass `error={(e) => …}` to surface it.

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

**`useControllableState`** is the controlled/uncontrolled pattern as one primitive — it lives here (not in `@pyreon/hooks`) because it's a props primitive with no lifecycle, used in the same breath as `splitProps`. `@pyreon/hooks` re-exports it for back-compat.

```tsx
import { splitProps, useControllableState } from '@pyreon/core'

function Switch(props: { checked?: boolean; onChange?: (v: boolean) => void }) {
  const [own, rest] = splitProps(props, ['checked', 'onChange'])
  // `value` MUST be a getter, or the controlled prop is read once and frozen.
  const [checked, setChecked] = useControllableState({
    value: () => own.checked,
    defaultValue: false,
    onChange: own.onChange,
  })
  return <button {...rest} aria-checked={() => (checked() ? 'true' : 'false')} onClick={() => setChecked(!checked())} />
}
```

## Refs and directives

`elementRef()` is a single value that is *both* the ref and the accessor element-consuming hooks want (`useElementSize`, `useClickOutside`, `useDraggable`, …). The runtime already calls a function ref as `ref(el)` on mount and `ref(null)` on unmount — so "called with an argument" means SET and "called with no argument" means READ:

```tsx
import { elementRef } from '@pyreon/core'
import { useElementSize } from '@pyreon/hooks'

function Card() {
  const el = elementRef<HTMLDivElement>()
  const size = useElementSize(el)   // it IS () => T | null
  return <div ref={el}>{size().width}px</div>
}
```

Without it, wiring N hooks to one element costs three touchpoints each (declare a local, hand-write a `() => el` thunk per hook, wire a callback ref back to the local) — `elementRef` collapses that to two, and N hooks on the same element add none of them. `.current` is kept so it drops into code written against `createRef`.

`use()` composes element **directives** — plain `(el) => cleanup | void` functions — into a single ref callback, so attaching N behaviours costs one attribute instead of N hook calls and a ref attach:

```tsx
import { use, type Directive } from '@pyreon/core'

const clickOutside = (cb: () => void): Directive => (el) => {
  const h = (e: Event) => { if (!el.contains(e.target as Node)) cb() }
  document.addEventListener('mousedown', h)
  return () => document.removeEventListener('mousedown', h)
}

<div ref={use(autoFocus, clickOutside(close), hotkey({ Escape: close }))} />
```

Nothing here is compiler- or renderer-special-cased — `use()` just returns an ordinary `RefCallback`. Cleanups run in **reverse** attach order (LIFO), so a directive whose setup depends on an earlier one tears down first. Falsy entries are skipped, so a directive can be applied conditionally inline: `use(base, isOpen && trapFocus())`. A re-attach without an intervening detach (a `KeepAlive` remount, a re-applied spread) tears the previous registration down first — listeners never pile up.

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

Full docs: [pyreon.dev/docs/core](https://pyreon.dev/docs/core) (or `docs/src/content/docs/core.md` in this repo).

## License

MIT
