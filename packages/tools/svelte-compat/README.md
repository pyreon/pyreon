# @pyreon/svelte-compat

Svelte-compatible **importable runtime API** that runs on Pyreon's signal-based reactive engine. Migrate Svelte store / lifecycle code by swapping the import path.

## Install

```bash
bun add @pyreon/svelte-compat
```

## Scope

This shims the APIs Svelte code actually `import`s:

- **`svelte/store`** — `writable`, `readable`, `derived`, `get`, `readonly`
- **`svelte`** — `onMount`, `onDestroy`, `beforeUpdate`, `afterUpdate`, `tick`, `setContext`, `getContext`, `hasContext`, `getAllContexts`, `createEventDispatcher`, `mount`, `unmount`, `flushSync`

It does **not** implement the `.svelte` single-file-component compiler or the Svelte 5 rune *syntax* (`$state` / `$derived` / `$effect`) — those are compiler constructs, not runtime imports. This is the same boundary `@pyreon/solid-compat` draws around Solid's compiler. Components here are plain functions returning JSX that run on Pyreon via the shared compat JSX runtime.

## Quick Start

```ts
// Replace:
// import { writable, derived } from "svelte/store"
// With:
import { writable, derived } from '@pyreon/svelte-compat'

const count = writable(0)
const doubled = derived(count, (n) => n * 2)

const unsub = doubled.subscribe((v) => console.log('doubled:', v))
count.set(5) // logs "doubled: 10"
count.update((n) => n + 1) // logs "doubled: 12"
unsub()
```

### Stores in components

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

### Lazy start/stop notifier

`writable`'s second argument runs when the subscriber count goes `0 → 1` and its returned function runs at `1 → 0` — exactly Svelte's contract:

```ts
import { readable } from '@pyreon/svelte-compat'

const time = readable(new Date(), (set) => {
  const id = setInterval(() => set(new Date()), 1000)
  return () => clearInterval(id) // stop notifier
})
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
  onMount(() => console.log('mounted'))
  onDestroy(() => console.log('destroyed'))
  return <span>theme: {theme}</span>
}
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

## Enabling compat mode in Vite

```ts
// vite.config.ts
import pyreon from '@pyreon/vite-plugin'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [pyreon({ compat: 'svelte' })],
})
```

This redirects `svelte` and `svelte/store` imports to `@pyreon/svelte-compat` and routes JSX through the compat runtime.

## Documented boundaries

- `beforeUpdate` / `afterUpdate` map to a post-first-render hook, not Svelte's per-tick timing — the compat wrapper re-renders by teardown + rebuild (no per-update diff). Most Svelte interop uses `onMount` / `onDestroy`, which are exact.
- `getAllContexts` returns an empty `Map` (Pyreon contexts are not enumerable per-component). `setContext` / `getContext` / `hasContext` are exact.
- `createEventDispatcher` forwards to the component's `on<Type>` / `on:<type>` prop (Svelte's compiler turns `<Child on:foo>` into a prop; here it's a prop you pass).
- No `.svelte` SFC compiler, no rune syntax (compiler constructs, not runtime imports).

## License

MIT
