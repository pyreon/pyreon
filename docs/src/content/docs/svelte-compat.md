---
title: '@pyreon/svelte-compat'
description: Svelte-compatible importable runtime API (stores + lifecycle + context + Svelte-5 client API) running on Pyreon's reactive engine.
---

`@pyreon/svelte-compat` shims the Svelte APIs your code actually
`import`s — `svelte/store` (`writable` / `readable` / `derived` / `get` /
`readonly`) and the `svelte` lifecycle / context / dispatch / client
surface — all running on Pyreon's reactive engine. Migrate Svelte store
and lifecycle code by swapping the import path; no rewrite. Components
are plain functions returning JSX that run on Pyreon via a shared compat
JSX runtime, re-rendering when a store they subscribe to changes.

<PackageBadge name="@pyreon/svelte-compat" href="/docs/svelte-compat" status="stable" />

## Scope

This is a **runtime** shim, not the Svelte compiler. It covers what code
imports at runtime — the same boundary `@pyreon/solid-compat` draws
around Solid's compiler:

- **`svelte/store`** — `writable`, `readable`, `derived`, `get`,
  `readonly`
- **`svelte`** — `onMount`, `onDestroy`, `beforeUpdate`, `afterUpdate`,
  `tick`, `setContext`, `getContext`, `hasContext`, `getAllContexts`,
  `createEventDispatcher`, `mount`, `unmount`, `flushSync`
- **control flow** — `Show`, `For`, `Switch`, `Match`, `Suspense`,
  `ErrorBoundary` (re-exported from `@pyreon/core`)

It does **not** implement the `.svelte` single-file-component compiler or
the Svelte 5 rune *syntax* — `$state` / `$derived` / `$effect` / the
`$store` auto-subscription sugar are compiler constructs, not runtime
imports, so they have no shim. Use Pyreon's own primitives
(`signal` / `computed` / `effect`) for in-component reactive state, and
subscribe a store into a component-local for the `$store` equivalent
(see [Stores in a component](#stores-in-a-component)).

:::note
Svelte is the one sibling compat layer with the widest paradigm gap.
React, Preact, Vue, and Solid all ship runtime APIs you import; Svelte's
core ergonomics (`$:`, `$state`, `$store`, the `.svelte` file format)
live in its *compiler*. So `@pyreon/svelte-compat` is deliberately a
**store + lifecycle + client-API** shim — the parts of Svelte that are
runtime imports — not a Svelte component runtime. Most Svelte interop in
practice is store and lifecycle code; that is exactly what this layer
makes portable.
:::

## Installation

:::code-group

```bash [npm]
npm install @pyreon/svelte-compat
```

```bash [bun]
bun add @pyreon/svelte-compat
```

```bash [pnpm]
pnpm add @pyreon/svelte-compat
```

```bash [yarn]
yarn add @pyreon/svelte-compat
```

:::

## Quick Start

Replace your Svelte store imports:

```ts
// Before
import { writable, derived } from 'svelte/store'

// After
import { writable, derived } from '@pyreon/svelte-compat'
```

```ts
import { writable, derived, get } from '@pyreon/svelte-compat'

const count = writable(0)
const doubled = derived(count, (n) => n * 2)

const unsub = doubled.subscribe((v) => console.log('doubled:', v))
count.set(5) // logs "doubled: 10"
count.update((n) => n + 1) // logs "doubled: 12"
unsub()

get(count) // 6 — synchronous read
```

### Two import surfaces

`@pyreon/svelte-compat` ships two entry points that mirror Svelte's own
module split:

| Specifier                       | Mirrors          | Exports                                                                                                              |
| ------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------- |
| `@pyreon/svelte-compat`         | `svelte`         | everything — stores **and** lifecycle / context / dispatch / `mount` / control flow                                  |
| `@pyreon/svelte-compat/store`   | `svelte/store`   | exactly the store API: `writable`, `readable`, `derived`, `get`, `readonly`                                          |

The functions re-exported from `/store` are the **same identities** as
the main entry — importing `writable` from either gives you the same
function. Use `/store` when you want the subpath to match Svelte's real
`svelte/store` shape (no lifecycle leakage).

```ts
// Mirrors `import { writable } from 'svelte/store'`
import { writable, derived } from '@pyreon/svelte-compat/store'
```

## Stores

The store implementation is a **faithful, signal-free Svelte store** — a
plain `Set` of subscribers notified synchronously on `set` / `update`,
exactly like Svelte's own `writable`. It is **not** backed by a Pyreon
signal: Svelte's store contract (synchronous notify, lazy start/stop,
two-phase `invalidate` → `run`) maps cleanly onto a subscriber set, and
`derived` subscribes to its inputs explicitly, so no signal
auto-tracking is needed.

:::tip{title="Signal-free by design"}
A persistent tracking effect created inside a compat component's render
would be collected as an inner effect and disposed on the next
re-render — so store changes would stop propagating after the first one.
A plain subscriber `Set` has no such hazard: it lives until the
component unmounts (the unsubscribe is registered in the component's
cleanup callbacks). This is why the store is deliberately signal-free,
matching Svelte exactly rather than reaching for Pyreon's signal engine.
:::

### `writable`

```ts
function writable<T>(value?: T, start?: StartStopNotifier<T>): Writable<T>

interface Writable<T> extends Readable<T> {
  set(value: T): void
  update(updater: (value: T) => T): void
}
```

Creates a writable store. `subscribe` invokes the subscriber
**immediately** with the current value (Svelte's contract), then again on
every change. `set` replaces the value; `update` applies an updater to
the current value.

```ts
import { writable } from '@pyreon/svelte-compat'

const count = writable(0)

const unsub = count.subscribe((v) => console.log(v)) // logs 0 immediately
count.set(5) // logs 5
count.update((n) => n + 1) // logs 6
unsub()
count.set(99) // ignored — unsubscribed
```

**Change detection (`safe_not_equal`).** Like Svelte, primitives are
deduplicated (setting `5` when the value is already `5` does not notify),
but **objects and functions always notify** — so an in-place-mutated
store object still propagates:

```ts
const cart = writable({ items: [] as string[] })

cart.update((c) => {
  c.items.push('apple') // in-place mutation
  return c // same reference — still notifies (object identity rule)
})
```

### `readable`

```ts
function readable<T>(value?: T, start?: StartStopNotifier<T>): Readable<T>

interface Readable<T> {
  subscribe(run: (value: T) => void, invalidate?: (value?: T) => void): () => void
}
```

A `writable` with `set` / `update` hidden — a read-only store whose value
is driven entirely by its `start` notifier.

```ts
import { readable } from '@pyreon/svelte-compat'

const now = readable(new Date(), (set) => {
  const id = setInterval(() => set(new Date()), 1000)
  return () => clearInterval(id) // stop notifier
})
```

### `readonly`

```ts
function readonly<T>(store: Readable<T>): Readable<T>
```

Returns a read-only view of an existing store — exposes only
`subscribe`, hiding `set` / `update` on a writable. The underlying store
keeps driving the view's value.

```ts
import { writable, readonly } from '@pyreon/svelte-compat'

const _count = writable(0)
export const count = readonly(_count) // consumers can subscribe but not write
```

### `derived`

```ts
function derived<S, T>(
  stores: S,
  fn: ((values: StoresValues<S>) => T)
    | ((values: StoresValues<S>, set: (v: T) => void, update: (fn: Updater<T>) => void) => Unsubscriber | void),
  initialValue?: T,
): Readable<T>
```

Derives a store from one or more source stores. `stores` is a single
store or an array of stores; the value is computed by `fn`. Two forms,
distinguished by `fn`'s arity (Svelte's exact rule):

- **Sync** — `(values) => result`. Returns the derived value directly.
- **Async / cleanup** — `(values, set, update?) => stop`. Pushes values
  asynchronously via `set` / `update`; may return a cleanup that runs
  before the next recomputation and on final unsubscribe.

```ts
import { writable, derived } from '@pyreon/svelte-compat'

// Single source, sync
const n = writable(2)
const doubled = derived(n, (v) => v * 2)

// Multiple sources, sync — values arrive as a tuple
const a = writable(1)
const b = writable(2)
const sum = derived([a, b], ([x, y]) => x + y)
```

**Async / cleanup form** — model a real async source (fetch, timer). The
`initialValue` is shown until the async result lands; the returned
cleanup cancels an in-flight result before the next run:

```ts
const id = writable(1)
const user = derived(
  id,
  (currentId, set) => {
    let cancelled = false
    fetch(`/api/user/${currentId}`)
      .then((r) => r.json())
      .then((u) => !cancelled && set(u))
    return () => {
      cancelled = true // cleanup before next run / on final unsubscribe
    }
  },
  null,
)
```

:::note
A synchronous `set` inside `start` (or inside `derived`'s notifier) mutates
the value but does **not** emit — the store is not "ready" until `start`
returns. So the first subscriber sees exactly the post-start value, with
no spurious initial emission. This matches Svelte's `derived` exactly:
one emission, no double-fire.
:::

### `get`

```ts
function get<T>(store: Readable<T>): T
```

Reads a store's current value synchronously. Implemented by subscribing
and immediately unsubscribing — so it never leaves a live subscription
(and never triggers the lazy `start` to stay running).

```ts
import { writable, get } from '@pyreon/svelte-compat'

const count = writable(123)
get(count) // 123
count.set(456)
get(count) // 456
```

### Lazy start / stop notifier

`writable` / `readable`'s second argument is the lazy notifier. It runs
when the subscriber count goes `0 → 1` and its returned function runs at
`1 → 0` — exactly Svelte's contract. Use it for resources that should
only be live while something is listening:

```ts
import { readable } from '@pyreon/svelte-compat'

let started = 0
let stopped = 0

const ticker = readable(0, (set) => {
  started++
  const id = setInterval(() => set(Date.now()), 1000)
  return () => {
    stopped++
    clearInterval(id)
  }
})

const u1 = ticker.subscribe(() => {}) // started === 1 (0 → 1)
const u2 = ticker.subscribe(() => {}) // started === 1 (not re-run)
u1() // stopped === 0 (still 1 subscriber)
u2() // stopped === 1 (1 → 0)
```

### Stores in a component

Without the `$store` compiler sugar, subscribe the store into a
component-local. The compat layer makes a subscription created inside a
compat component body the **faithful equivalent of Svelte's `$store`
auto-subscription**: the subscriber carries the component's re-render
trigger, so a store write re-renders the component, and the subscription
is automatically torn down on unmount.

```tsx
import { writable } from '@pyreon/svelte-compat'

const count = writable(0)

function Counter() {
  let c = 0
  count.subscribe((v) => (c = v)) // $count equivalent — re-renders on change

  return (
    <button type="button" onClick={() => count.update((n) => n + 1)}>
      clicked {c} times
    </button>
  )
}
```

:::warning{title="The re-render is teardown + rebuild, not a fine-grained patch"}
A compat component re-renders by re-running its body and rebuilding its
output — it does **not** do per-binding fine-grained patching the way a
Pyreon-native component does. This is correct and matches Svelte's
component-level reactivity model, but for the leanest possible updates in
new Pyreon code, prefer a `signal()` read directly in JSX
(`{count()}`) over a store + component-local. The store path exists so
*existing* Svelte store code ports without a rewrite.
:::

## Lifecycle

### `onMount`

```ts
function onMount(fn: () => (() => void) | void): void
```

Runs `fn` once after the component's first render. If `fn` returns a
function, that function runs on destroy — exactly Svelte's contract.

```tsx
import { onMount } from '@pyreon/svelte-compat'

function Clock() {
  let time = ''
  onMount(() => {
    const id = setInterval(() => (time = new Date().toLocaleTimeString()), 1000)
    return () => clearInterval(id) // runs on destroy
  })
  return <span>{time}</span>
}
```

`onMount` is hook-index-stable across re-renders: it registers exactly
once and never re-fires when the component re-renders, matching Svelte.
Called **outside** a compat component, it falls back to Pyreon's own
`onMount`.

### `onDestroy`

```ts
function onDestroy(fn: () => void): void
```

Runs `fn` when the component unmounts. Like `onMount`, it is
hook-index-stable (registered once) and falls back to Pyreon's
`onUnmount` outside a compat component.

```tsx
import { onMount, onDestroy } from '@pyreon/svelte-compat'

function Subscription() {
  const socket = new WebSocket('wss://example.com')
  onDestroy(() => socket.close())
  return <span>live</span>
}
```

:::tip
Prefer the `onMount` cleanup-return form over a separate `onDestroy` when
the setup and teardown are paired (a timer, a listener, a socket) — it
keeps the resource's lifecycle in one place. Use a standalone `onDestroy`
only when the cleanup has no matching setup in an `onMount`.
:::

### `beforeUpdate` / `afterUpdate`

```ts
function beforeUpdate(fn: () => void): void
function afterUpdate(fn: () => void): void
```

`beforeUpdate` runs once **before the first render commits**;
`afterUpdate` runs **after the first render** (it is implemented on top
of `onMount`). See the boundary note below — these do not carry Svelte's
per-tick timing.

```tsx
import { beforeUpdate, afterUpdate } from '@pyreon/svelte-compat'

function Logger() {
  beforeUpdate(() => console.log('about to render'))
  afterUpdate(() => console.log('rendered'))
  return <div />
}
```

:::warning{title="No per-tick update timing"}
The compat wrapper re-renders by teardown + rebuild rather than a
per-update diff, so `beforeUpdate` / `afterUpdate` map to a
post-first-render hook — **not** Svelte's "before/after every reactive
update" timing. They will not fire again on each store-driven re-render.
For per-change side effects, drive them from a store subscription or a
Pyreon `effect()` instead. Most real Svelte interop uses `onMount` /
`onDestroy`, which are exact.
:::

### `tick`

```ts
function tick(): Promise<void>
```

Resolves after the current microtask, letting you `await` queued work —
the same shape as Svelte's `tick`.

```ts
import { tick } from '@pyreon/svelte-compat'

count.set(42)
await tick() // queued re-renders / microtasks have flushed
```

## Context

Svelte's context is keyed by an arbitrary value (commonly a `Symbol`).
The compat layer backs each key with a Pyreon context registered in a
global registry, so `setContext` / `getContext` / `hasContext` resolve
through Pyreon's context tree.

### `setContext`

```ts
function setContext<T>(key: unknown, context: T): T
```

Provides `context` for descendants of the current component, and returns
the provided value (Svelte's contract).

### `getContext`

```ts
function getContext<T>(key: unknown): T
```

Reads the nearest value provided up-tree for `key`.

### `hasContext`

```ts
function hasContext(key: unknown): boolean
```

Reports whether a value was provided up-tree for `key` (true when the
resolved value is not `undefined`).

```tsx
import { setContext, getContext, hasContext } from '@pyreon/svelte-compat'

const THEME = Symbol('theme')

function Provider(props: { children?: unknown }) {
  setContext(THEME, 'dark')
  return props.children
}

function Consumer() {
  if (!hasContext(THEME)) return <span>no theme</span>
  const theme = getContext<string>(THEME)
  return <span data-theme={theme}>{theme}</span>
}
```

### `getAllContexts`

```ts
function getAllContexts<T extends Map<unknown, unknown>>(): T
```

Best-effort — returns an empty `Map`. See the boundary note.

:::warning{title="getAllContexts returns an empty Map"}
Pyreon contexts are not enumerable per-component, so `getAllContexts`
cannot reconstruct the set of all provided keys and returns an empty
`Map`. `setContext` / `getContext` / `hasContext` resolve correctly —
only the *enumerate-everything* operation is unsupported. If you relied
on `getAllContexts` to forward context to a dynamically-created child
component, pass the values explicitly through the relevant keys instead.
:::

## Events — `createEventDispatcher`

```ts
function createEventDispatcher<EventMap>(): <Type extends keyof EventMap & string>(
  type: Type,
  detail?: EventMap[Type],
) => boolean
```

Returns a `dispatch(type, detail?)` function. In Svelte, `<Child on:foo>`
is compiled into a prop; here the dispatcher forwards to the current
component's matching prop with a `CustomEvent`, and returns
`!event.defaultPrevented`.

The handler prop is resolved in this order:

1. `on<Type>` — `dispatch('ping')` → `onPing` (the idiomatic JSX prop)
2. `on:<type>` — `on:ping` (Svelte-directive-style prop name)
3. `on<type>` — `onping` (lowercase fallback)

```tsx
import { createEventDispatcher, onMount } from '@pyreon/svelte-compat'

function Child() {
  const dispatch = createEventDispatcher<{ ping: number }>()
  onMount(() => dispatch('ping', 7)) // detail is the CustomEvent.detail
  return <span>child</span>
}

function Parent() {
  // dispatch('ping', …) resolves to the `onPing` prop here
  return <Child onPing={(e: CustomEvent<number>) => console.log(e.detail)} />
}
```

:::warning{title="No bubbling, no on:foo compiler transform"}
Svelte's compiler turns `on:foo` on a component into an event you can
forward and that bubbles through the component tree. Here `dispatch` only
calls the **direct parent's** matching prop — it does not bubble through
intermediate components. Pass the handler as a prop (`onFoo` / `on:foo` /
`onfoo`) to the component that dispatches, mirroring how the sibling
compat layers map child events to props. There is no `createEventDispatcher`
auto-forwarding across multiple levels.
:::

## Svelte 5 client API — `mount` / `unmount` / `flushSync`

### `mount`

```ts
function mount<P>(Component: (props: P) => VNodeChild, options: {
  target: Element
  props?: P
  context?: Map<unknown, unknown>
}): P
```

Mounts a compat component into `target`. Routes through the compat JSX
runtime so the component runs inside the shared wrapper (lifecycle +
store-driven re-render), exactly as a JSX-rendered child would. Returns
the props object — in Svelte 5 `mount` returns the component's exports;
here the props object is the surface (and it carries the disposer used by
`unmount`).

```ts
import { mount, unmount } from '@pyreon/svelte-compat'

function App(props: { label: string }) {
  return <div id="app">{props.label}</div>
}

const instance = mount(App, {
  target: document.getElementById('root')!,
  props: { label: 'hello' },
})

// later
unmount(instance)
```

:::note
The `context` option is accepted for API-shape parity with Svelte 5's
`mount`. Context for the mounted tree is established the Pyreon way —
through `setContext` inside the component, or a provider component — not
via a pre-seeded `Map`.
:::

### `unmount`

```ts
function unmount(mounted: Record<symbol, unknown>): void
```

Disposes a component previously mounted with `mount`. Pass the object
returned by `mount`. Calling it on an object that was never mounted is a
safe no-op.

### `flushSync`

```ts
function flushSync<T>(fn?: () => T): T | undefined
```

Runs `fn` (if provided) and returns its result. Pyreon batches reactive
work synchronously, so this is effectively just invoking `fn` — the
"flush" Svelte 5 needs after a synchronous state change is already
guaranteed by Pyreon's synchronous notify model.

```ts
import { flushSync } from '@pyreon/svelte-compat'

const result = flushSync(() => {
  count.set(1)
  return get(count) // 1 — already applied
})
```

## Control flow

`Show`, `For`, `Switch`, `Match`, `Suspense`, and `ErrorBoundary` are
re-exported from `@pyreon/core` and are recognized as native components
by the compat JSX runtime — they are **not** wrapped, so they keep their
own internal reactivity. Svelte's own control flow is block syntax
(`{#if}` / `{#each}` / `{#await}`), which is a compiler construct with no
runtime import; use these Pyreon components in JSX instead.

```tsx
import { Show, For, Switch, Match } from '@pyreon/svelte-compat'

function List(props: { items: () => Item[]; status: () => string }) {
  return (
    <Switch fallback={<p>idle</p>}>
      <Match when={() => props.status() === 'loading'}>
        <Spinner />
      </Match>
      <Match when={() => props.status() === 'ready'}>
        <Show when={() => props.items().length > 0} fallback={<p>empty</p>}>
          <ul>
            <For each={props.items} by={(i) => i.id}>
              {(item) => <li>{item.name}</li>}
            </For>
          </ul>
        </Show>
      </Match>
    </Switch>
  )
}
```

| Svelte block       | Pyreon control-flow component |
| ------------------ | ----------------------------- |
| `{#if}` / `{:else}` | `<Show when fallback>`        |
| `{#each}`          | `<For each by>`               |
| `{#if}` chains     | `<Switch>` + `<Match when>`   |
| `{#await}`         | `<Suspense fallback>`         |
| `<svelte:boundary>`| `<ErrorBoundary fallback>`    |

## Enabling compat mode in Vite

```ts
// vite.config.ts
import pyreon from '@pyreon/vite-plugin'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [pyreon({ compat: 'svelte' })],
})
```

With `compat: 'svelte'`, `import … from 'svelte'` resolves to
`@pyreon/svelte-compat` and `import … from 'svelte/store'` resolves to
`@pyreon/svelte-compat/store`, and JSX routes through the compat runtime
automatically — so existing import paths keep working unchanged.

## The `nativeCompat` marker

The compat JSX runtime wraps every user component so it returns a
reactive accessor (enabling store-driven re-renders). Pyreon **framework
components** — context Providers, `RouterView`, `PyreonUI`, and the
control-flow primitives above — must NOT be wrapped: their bodies use
`provide()` / `onMount()` / `effect()` at setup scope, which only work
inside Pyreon's own setup frame. Those components are marked with
`nativeCompat()` from `@pyreon/core`, and the compat runtime routes a
marked component through `h(type, props)` directly (no wrapper).

If you write your **own** Pyreon-flavored helper component that uses
`provide()` / `onMount()` and render it in a `compat: 'svelte'` app, mark
it so it runs in the native setup frame:

```tsx
import { nativeCompat, provide, createContext } from '@pyreon/core'

const ThemeCtx = createContext('light')

function ThemeProvider(props: { value: string; children?: unknown }) {
  provide(ThemeCtx, props.value) // needs the native setup frame
  return props.children
}
nativeCompat(ThemeProvider) // route through h() directly — no compat wrapper
```

See the [native marker contract](/docs/native-compat) for the full
rules. The 24 framework components that ship marked (RouterView,
PyreonUI, FormProvider, …) work automatically — this is only for
user-defined Pyreon-flavored helpers in compat-scaffolded apps.

## Migration

### Rune syntax — `$state` / `$derived` / `$effect`

These are **compiler runes**, not runtime imports — there is nothing to
shim. Map them onto Pyreon's primitives:

```ts
// Svelte 5 runes (compiler syntax)
let count = $state(0)
let doubled = $derived(count * 2)
$effect(() => console.log(doubled))

// Pyreon equivalents (runtime primitives)
import { signal, computed, effect } from '@pyreon/reactivity'

const count = signal(0)
const doubled = computed(() => count() * 2)
effect(() => console.log(doubled()))
```

| Svelte 5 rune                  | Pyreon equivalent                                        |
| ------------------------------ | -------------------------------------------------------- |
| `$state(v)`                    | `signal(v)` — read `s()`, write `s.set(v)`               |
| `$derived(expr)`               | `computed(() => expr)`                                   |
| `$effect(() => …)`             | `effect(() => …)`                                        |
| `$props()`                     | the component's `props` argument                         |
| `$bindable()`                  | a `signal` passed down + a callback prop                 |

### The `$:` reactive label

Svelte 3/4's `$:` reactive statement is also a compiler construct. Replace
the reactive *value* form with a `computed`, and the reactive
*side-effect* form with an `effect`:

```ts
// Svelte: $: doubled = count * 2
const doubled = computed(() => count() * 2)

// Svelte: $: console.log(count)
effect(() => console.log(count()))
```

### Store store — direct port

Store code ports with **zero changes** beyond the import path. The store
contract — `subscribe(run, invalidate?) → unsubscribe`, lazy
`start(set, update?) → stop`, two-phase `invalidate` → `run`, immediate
initial subscriber call, `safe_not_equal` change detection — matches
Svelte exactly.

```ts
// Before
import { writable, derived, get } from 'svelte/store'
// After — same code, new path
import { writable, derived, get } from '@pyreon/svelte-compat/store'
```

### Migration checklist

1. **Stores** — swap `svelte/store` → `@pyreon/svelte-compat/store`. No
   code changes; the store contract is identical.
2. **Lifecycle** — swap `svelte` → `@pyreon/svelte-compat`. `onMount` /
   `onDestroy` / `tick` are exact. Audit `beforeUpdate` / `afterUpdate`:
   they map to a post-first-render hook, not per-tick (see the boundary).
3. **Context** — `setContext` / `getContext` / `hasContext` port
   directly. Replace any `getAllContexts` usage with explicit per-key
   passing — it returns an empty `Map`.
4. **Events** — `createEventDispatcher` ports, but the parent must pass
   the handler as a prop (`onFoo` / `on:foo`); there is no `on:foo`
   bubbling across levels.
5. **`$store` auto-subscription** — replace with a `.subscribe()` into a
   component-local (re-renders the component) or, for new code, a Pyreon
   `signal()` read directly in JSX.
6. **Runes (`$state` / `$derived` / `$effect`) and `$:`** — these are
   compiler syntax, not imports. Rewrite to `signal` / `computed` /
   `effect` from `@pyreon/reactivity`.
7. **`.svelte` files** — there is no SFC compiler. Write components as
   plain functions returning JSX.
8. **Control flow** — replace `{#if}` / `{#each}` / `{#await}` blocks
   with `<Show>` / `<For>` / `<Suspense>` components.
9. **Svelte 5 `mount` / `unmount` / `flushSync`** — port directly; the
   shapes match.

## API Reference

### `svelte/store`

| API                          | Signature                                                                         | Behavior                                                                                                          |
| ---------------------------- | --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `writable(value?, start?)`   | `(value?: T, start?: StartStopNotifier<T>) => Writable<T>`                         | Readable + `set` / `update`. Signal-free subscriber `Set`. `start` is the lazy `0→1` / `1→0` notifier. `safe_not_equal` dedup (objects/functions always notify). |
| `readable(value?, start?)`   | `(value?: T, start?: StartStopNotifier<T>) => Readable<T>`                         | A `writable` with `set` / `update` hidden.                                                                        |
| `readonly(store)`            | `(store: Readable<T>) => Readable<T>`                                              | A read-only view of a store exposing only `subscribe`.                                                            |
| `derived(stores, fn, init?)` | `(stores, fn, initialValue?) => Readable<T>`                                       | Single store or array; sync `(values) => T` or async `(values, set, update?) => stop`. Form chosen by `fn`'s arity. |
| `get(store)`                 | `(store: Readable<T>) => T`                                                        | Synchronous one-shot read (subscribe + immediately unsubscribe).                                                  |

### `svelte` lifecycle / context / events / client

| API                              | Signature                                                          | Behavior                                                                                                |
| -------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `onMount(fn)`                    | `(fn: () => (() => void) \| void) => void`                        | Runs after first render. A returned function runs on destroy. Hook-index-stable (registers once).        |
| `onDestroy(fn)`                  | `(fn: () => void) => void`                                        | Runs on unmount. Hook-index-stable.                                                                      |
| `beforeUpdate(fn)`               | `(fn: () => void) => void`                                        | Runs once before the first render commits (see boundary — not per-tick).                                 |
| `afterUpdate(fn)`                | `(fn: () => void) => void`                                        | Runs after the first render, on top of `onMount` (see boundary — not per-tick).                          |
| `tick()`                         | `() => Promise<void>`                                            | Resolves after the current microtask.                                                                    |
| `setContext(key, context)`       | `(key: unknown, context: T) => T`                                | Provides a value for descendants; returns it.                                                            |
| `getContext(key)`                | `(key: unknown) => T`                                            | Reads the nearest provided value up-tree.                                                                 |
| `hasContext(key)`                | `(key: unknown) => boolean`                                      | Whether a value was provided up-tree (resolved value not `undefined`).                                   |
| `getAllContexts()`               | `() => Map<unknown, unknown>`                                    | Best-effort — returns an empty `Map` (see boundary).                                                     |
| `createEventDispatcher()`        | `() => (type, detail?) => boolean`                              | Returns `dispatch(type, detail?)`; forwards to the parent's `on<Type>` / `on:<type>` / `on<type>` prop with a `CustomEvent`; returns `!defaultPrevented`. |
| `mount(Component, options)`      | `(Component, { target, props?, context? }) => P`                | Svelte-5 client API — mounts a component into `target`; returns the props object (carries the disposer). |
| `unmount(mounted)`               | `(mounted: Record<symbol, unknown>) => void`                    | Disposes a component mounted via `mount`; no-op on a non-mounted object.                                 |
| `flushSync(fn?)`                 | `(fn?: () => T) => T \| undefined`                              | Runs `fn` and returns its result (Pyreon batches synchronously).                                         |

### Control flow (re-exported from `@pyreon/core`)

| Export          | Replaces (Svelte block)         |
| --------------- | ------------------------------- |
| `Show`          | `{#if}` / `{:else}`             |
| `For`           | `{#each}`                       |
| `Switch`        | `{#if}` chains                  |
| `Match`         | a `{#if}` branch                |
| `Suspense`      | `{#await}`                      |
| `ErrorBoundary` | `<svelte:boundary>`             |

### Types

| Type                  | Shape                                                                |
| --------------------- | -------------------------------------------------------------------- |
| `Readable<T>`         | `{ subscribe(run, invalidate?): Unsubscriber }`                      |
| `Writable<T>`         | `Readable<T> & { set(value): void; update(updater): void }`          |
| `Subscriber<T>`       | `(value: T) => void`                                                 |
| `Invalidator<T>`      | `(value?: T) => void`                                                |
| `Unsubscriber`        | `() => void`                                                         |
| `Updater<T>`          | `(value: T) => T`                                                    |
| `StartStopNotifier<T>`| `(set, update) => Unsubscriber \| void` — lazy notifier, runs on first subscriber |

## Documented boundaries

- **No `.svelte` SFC compiler, no rune / `$:` syntax.** `$state` /
  `$derived` / `$effect` / `$:` / the `$store` auto-subscription sugar
  are compiler constructs, not runtime imports — there is no shim. Map
  them to `signal` / `computed` / `effect` and a `.subscribe()`
  component-local (see [Migration](#migration)).
- **`beforeUpdate` / `afterUpdate`** map to a post-first-render hook, not
  Svelte's per-tick timing — the wrapper re-renders by teardown + rebuild
  (no per-update diff). They do not re-fire on each store-driven
  re-render. Most Svelte interop uses `onMount` / `onDestroy`, which are
  exact.
- **`getAllContexts`** returns an empty `Map` (Pyreon contexts are not
  enumerable per-component). `setContext` / `getContext` / `hasContext`
  resolve correctly.
- **`createEventDispatcher`** forwards to the parent's matching prop
  (`onFoo` / `on:foo` / `onfoo`) — no bubbling across component levels,
  no `on:foo` compiler forwarding.
- **Stores are signal-free** — a faithful Svelte subscriber `Set`, not a
  Pyreon signal. The re-render of a component subscribing to a store is a
  teardown + rebuild, not a fine-grained per-binding patch.

## See also

- [Native marker contract](/docs/native-compat)
- [React Compat](/docs/react-compat) ·
  [Preact Compat](/docs/preact-compat) ·
  [Vue Compat](/docs/vue-compat) ·
  [Solid Compat](/docs/solid-compat)
- [Reactivity primitives](/docs/reactivity) — `signal` / `computed` /
  `effect` for new Pyreon code
