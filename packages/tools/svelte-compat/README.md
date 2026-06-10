# @pyreon/svelte-compat

Svelte-compatible importable runtime — stores, lifecycle, context — running on Pyreon's reactive engine.

`@pyreon/svelte-compat` shims the Svelte APIs your code actually `import`s — `svelte/store` (`writable` / `readable` / `derived` / `get` / `readonly`) and the `svelte` lifecycle / context / dispatch surface (`onMount`, `onDestroy`, `beforeUpdate`, `afterUpdate`, `tick`, `setContext` / `getContext` / `hasContext` / `getAllContexts`, `createEventDispatcher`, `mount` / `unmount` / `flushSync`) — all backed by Pyreon's signal-based reactivity. **This is a runtime shim, not a Svelte compiler.** Single-file components (`.svelte`), Svelte 5 rune *syntax* (`$state` / `$derived` / `$effect` / `$store` auto-subscription), and `<svelte:component>` directives are compiler constructs and are out of scope — only what code imports at runtime is covered (the same boundary `@pyreon/solid-compat` draws around Solid's compiler).

## Install

```bash
bun add @pyreon/svelte-compat
```

## Quick start

```ts
import { writable, derived, get } from '@pyreon/svelte-compat/store'

const count = writable(0)
const doubled = derived(count, ($c) => $c * 2)

const unsub = count.subscribe((c) => console.log(c))
count.set(5)         // logs 5
count.update((c) => c + 1)  // logs 6
get(doubled)         // 12
unsub()
```

```tsx
import { onMount, onDestroy, setContext, getContext, createEventDispatcher } from '@pyreon/svelte-compat'

const THEME = Symbol('theme')

function ThemeProvider({ children }) {
  setContext(THEME, { mode: 'dark' })
  onMount(() => console.log('mounted'))
  onDestroy(() => console.log('unmounted'))
  return <div>{children}</div>
}

function Child() {
  const theme = getContext(THEME)
  const dispatch = createEventDispatcher<{ click: { x: number } }>()
  return <button onClick={() => dispatch('click', { x: 1 })}>{theme.mode}</button>
}
```

## Subpath exports

| Subpath                                 | Surface                                                                                       |
| --------------------------------------- | --------------------------------------------------------------------------------------------- |
| `@pyreon/svelte-compat`                 | Lifecycle / context / dispatch: `onMount`, `onDestroy`, `beforeUpdate`, `afterUpdate`, `tick`, `setContext`, `getContext`, `hasContext`, `getAllContexts`, `createEventDispatcher`, `mount`, `unmount`, `flushSync`. Control-flow re-exports: `<For>`, `<Show>`, `<Switch>`, `<Match>`, `<ErrorBoundary>`, `<Suspense>` |
| `@pyreon/svelte-compat/store`           | Stores: `writable`, `readable`, `derived`, `readonly`, `get`, plus type exports (`Subscriber`, `Invalidator`, `Unsubscriber`, `Updater`, `StartStopNotifier`, `Readable`, `Writable`) |
| `@pyreon/svelte-compat/jsx-runtime`     | JSX automatic runtime (`jsx`, `jsxs`, `Fragment`)                                              |
| `@pyreon/svelte-compat/jsx-dev-runtime` | Dev variant — same runtime                                                                     |

## Stores (`svelte/store` equivalents)

| API                                  | Notes                                                                                  |
| ------------------------------------ | -------------------------------------------------------------------------------------- |
| `writable<T>(value?, start?)`        | Returns `{ set, update, subscribe }`. `start` runs on first subscribe with `set`/`update` and returns a stop fn. |
| `readable<T>(value?, start?)`        | Same as `writable` minus `set` / `update` — only `start` mutates.                       |
| `derived(stores, fn, initial?)`      | Auto-recomputes when any input store changes. `stores` can be a single store or an array. |
| `readonly(store)`                    | Strips `set` / `update` from a writable.                                                |
| `get(store)`                         | Synchronous one-shot read.                                                              |

Stores are **NOT** Pyreon `Signal`s under the hood (load-bearing lesson PR #704 caught) — using `signal()` inside the wrapper would freeze the store after first write under compat-mode component re-renders. Stores are a plain subscriber-set + value-snapshot, matching Svelte's own runtime semantics.

## Drop-in compat mode

`@pyreon/vite-plugin` can alias every `svelte` / `svelte/store` / `svelte/internal` import to this package:

```ts
// vite.config.ts
import pyreon from '@pyreon/vite-plugin'
export default { plugins: [pyreon({ compat: 'svelte' })] }
```

`tsconfig.json`:

```jsonc
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "@pyreon/svelte-compat"
  }
}
```

## Scope

This is a **runtime** shim. It covers what code imports at runtime — the same boundary `@pyreon/solid-compat` draws around Solid's compiler.

- ✅ `svelte/store` — `writable`, `readable`, `derived`, `get`, `readonly`
- ✅ `svelte` — `onMount`, `onDestroy`, `beforeUpdate`, `afterUpdate`, `tick`, context, dispatch, mount/unmount/flushSync
- ❌ `.svelte` single-file-component compiler
- ❌ Svelte 5 rune *syntax* (`$state` / `$derived` / `$effect` / `$store` auto-subscription)
- ❌ Reactive `$:` statements
- ❌ `<svelte:component>` / `<svelte:element>` directives

Components are plain functions returning JSX that run on Pyreon via the shared compat JSX runtime; they re-render the subtree on store change (matching Svelte's runtime semantics under the compat wrapper, not Pyreon's fine-grained model).

## Gotchas

- **Compat-layer stores must NOT be backed by Pyreon signals.** The compat-mode component wrapper disposes inner effects on the next re-render — a signal-backed store would freeze after first write. This is implemented internally; you only need to know the consequence: store APIs work as documented even under multi-render-cycle compat-mode components.
- **`createEventDispatcher` returns a callable**, mirroring Svelte. The dispatched event passes through Pyreon's standard handler invocation — the parent component sees `(e: CustomEvent<TDetail>) => …` shapes.
- **`flushSync` / `tick`** map to Pyreon's batch-flush primitives — they don't drive a full Svelte render cycle.

## Documentation

Full docs: [docs.pyreon.dev/docs/svelte-compat](https://docs.pyreon.dev/docs/svelte-compat) (or `docs/src/content/docs/svelte-compat.md` in this repo).

## License

MIT
