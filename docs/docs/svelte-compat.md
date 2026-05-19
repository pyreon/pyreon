---
title: '@pyreon/svelte-compat'
description: Svelte-compatible importable runtime API (stores + lifecycle + context) running on Pyreon's reactive engine.
---

`@pyreon/svelte-compat` shims the Svelte APIs your code actually
`import`s — `svelte/store` (`writable` / `readable` / `derived` / `get`
/ `readonly`) and the `svelte` lifecycle / context / dispatch surface —
all backed by Pyreon's signal-based reactive engine. Migrate Svelte
store and lifecycle code by swapping the import path; no rewrite.

<PackageBadge name="@pyreon/svelte-compat" href="/docs/svelte-compat" status="stable" />

## Scope

This is a **runtime** shim, not a Svelte compiler. It covers what code
imports at runtime — the same boundary `@pyreon/solid-compat` draws
around Solid's compiler:

- **`svelte/store`** — `writable`, `readable`, `derived`, `get`, `readonly`
- **`svelte`** — `onMount`, `onDestroy`, `beforeUpdate`, `afterUpdate`,
  `tick`, `setContext`, `getContext`, `hasContext`, `getAllContexts`,
  `createEventDispatcher`, `mount`, `unmount`, `flushSync`

It does **not** implement the `.svelte` single-file-component compiler
or the Svelte 5 rune *syntax* (`$state` / `$derived` / `$effect` / the
`$store` auto-subscription sugar) — those are compiler constructs, not
runtime imports. Components are plain functions returning JSX that run
on Pyreon via the shared compat JSX runtime (re-render on store change).

## Installation

::: code-group

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

### Stores in a component

Without the `$store` compiler sugar, subscribe into a component-local —
the compat layer re-renders the component when the store changes (the
faithful equivalent of Svelte's `$store` auto-subscription):

```tsx
import { writable } from '@pyreon/svelte-compat'

const count = writable(0)

function Counter() {
  let c = 0
  count.subscribe((v) => (c = v))
  return (
    <button type="button" onClick={() => count.update((n) => n + 1)}>
      clicked {c} times
    </button>
  )
}
```

### Lazy start / stop notifier

`writable`'s second argument runs when the subscriber count goes
`0 → 1`, and its returned function runs at `1 → 0` — exactly Svelte's
contract:

```ts
import { readable } from '@pyreon/svelte-compat'

const time = readable(new Date(), (set) => {
  const id = setInterval(() => set(new Date()), 1000)
  return () => clearInterval(id) // stop notifier
})
```

### `derived` — async / cleanup form

```ts
import { writable, derived } from '@pyreon/svelte-compat'

const id = writable(1)
const user = derived(
  id,
  (currentId, set) => {
    let cancelled = false
    fetch(`/api/user/${currentId}`)
      .then((r) => r.json())
      .then((u) => !cancelled && set(u))
    return () => (cancelled = true) // cleanup before next run
  },
  null,
)
```

### Lifecycle + context

```tsx
import { onMount, onDestroy, setContext, getContext } from '@pyreon/svelte-compat'

const KEY = Symbol('theme')

function Provider(props: { children?: unknown }) {
  setContext(KEY, 'dark')
  return props.children
}

function Consumer() {
  const theme = getContext<string>(KEY)
  onMount(() => {
    const id = setInterval(poll, 1000)
    return () => clearInterval(id) // runs on destroy (Svelte contract)
  })
  onDestroy(() => console.log('gone'))
  return <span>theme: {theme}</span>
}
```

## Enabling compat mode in Vite

```ts
// vite.config.ts
import pyreon from '@pyreon/vite-plugin'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [pyreon({ compat: 'svelte' })],
})
```

With `compat: 'svelte'`, `import … from 'svelte'` and
`import … from 'svelte/store'` resolve to `@pyreon/svelte-compat`
automatically, and JSX routes through the compat runtime.

## API

### `svelte/store`

| API                          | Behavior                                                                                       |
| ---------------------------- | ---------------------------------------------------------------------------------------------- |
| `writable(value?, start?)`   | Readable + `set` / `update`. Backed by a Pyreon signal. `start` is the lazy `0→1` / `1→0` notifier. |
| `readable(value?, start?)`   | A `writable` with `set` / `update` hidden.                                                      |
| `readonly(store)`            | A view of a store exposing only `subscribe`.                                                    |
| `derived(stores, fn, init?)` | Single store or array; sync `(values) => T` or async `(values, set, update?) => stop`.          |
| `get(store)`                 | Synchronous one-shot read (subscribe + immediately unsubscribe).                                |

### `svelte` lifecycle / context

| API                              | Behavior                                                                                  |
| -------------------------------- | ----------------------------------------------------------------------------------------- |
| `onMount(fn)`                    | Runs after first render. A returned function runs on destroy (Svelte contract).           |
| `onDestroy(fn)`                  | Runs on unmount.                                                                           |
| `beforeUpdate` / `afterUpdate`   | Map to a post-first-render hook (see boundaries).                                          |
| `tick()`                         | Resolves after the current microtask.                                                     |
| `setContext` / `getContext` / `hasContext` | Provide / read context up the component tree.                                   |
| `getAllContexts()`               | Best-effort — returns an empty `Map` (see boundaries).                                     |
| `createEventDispatcher()`        | Returns a `dispatch(type, detail?)` that forwards to the component's `on<Type>` / `on:<type>` prop with a `CustomEvent`; returns `!defaultPrevented`. |
| `mount` / `unmount` / `flushSync`| Svelte 5 client API — mount a component into a target / dispose / flush.                   |

## Documented boundaries

- **`beforeUpdate` / `afterUpdate`** map to a post-first-render hook,
  not Svelte's per-tick timing — the compat wrapper re-renders by
  teardown + rebuild (no per-update diff). Most Svelte interop uses
  `onMount` / `onDestroy`, which are exact.
- **`getAllContexts`** returns an empty `Map` (Pyreon contexts are not
  enumerable per-component). `setContext` / `getContext` / `hasContext`
  resolve correctly.
- **`createEventDispatcher`** — Svelte's compiler turns `<Child on:foo>`
  into a prop; here it is a prop you pass (`onFoo` / `on:foo`), mirroring
  how the sibling compat layers map child events to props.
- **No `.svelte` SFC compiler, no rune syntax** — those are compiler
  constructs, not runtime imports.

## See also

- [Native marker contract](/docs/native-compat)
- [React Compat](/docs/react-compat) ·
  [Preact Compat](/docs/preact-compat) ·
  [Solid Compat](/docs/solid-compat) ·
  [Vue Compat](/docs/vue-compat)
