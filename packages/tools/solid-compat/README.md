# @pyreon/solid-compat

SolidJS-compatible API shim — write Solid-style code that runs on Pyreon's reactive engine.

`@pyreon/solid-compat` provides the SolidJS surface (`createSignal`, `createEffect`, `createMemo`, `createComputed`, `createRenderEffect`, `createResource`, `createSelector`, `createRoot`, `createStore`, `createContext`/`useContext`, `mergeProps`, `splitProps`, `untrack`, `batch`, lifecycle hooks `onMount` / `onCleanup`, control-flow components `<For>` / `<Show>` / `<Switch>` / `<Match>` / `<Index>` / `<Dynamic>` / `<Portal>` / `<ErrorBoundary>` / `<Suspense>`, transitions, observables, `reconcile` / `unwrap` / `produce`) all on Pyreon's reactive engine. The signal/effect API names map closely to Solid's, but **the update model is coarser**: a Solid `createSignal` setter bumps an internal version signal that re-runs the whole component body (inside `runUntracked`), not just the exact DOM node Solid's compiler would update. Output and lifecycle stay correct (child instances are preserved, effects/cleanups fire as expected), but reactivity is per-component re-run, not Solid's fine-grained per-node. Some SolidJS APIs are not implemented — see [Not supported](#not-supported).

## Install

```bash
bun add @pyreon/solid-compat
```

## Quick start

```tsx
import { createSignal, createEffect } from '@pyreon/solid-compat'
import { render } from '@pyreon/solid-compat'

function Counter() {
  const [count, setCount] = createSignal(0)

  createEffect(() => {
    document.title = `Count: ${count()}`
  })

  return (
    <div>
      <p>Count: {count()}</p>
      <button onClick={() => setCount((c) => c + 1)}>+1</button>
    </div>
  )
}

render(() => <Counter />, document.getElementById('app')!)
```

## Subpath exports

| Subpath                                | Surface                                                                                       |
| -------------------------------------- | --------------------------------------------------------------------------------------------- |
| `@pyreon/solid-compat`                 | Full Solid surface — see API table below                                                       |
| `@pyreon/solid-compat/jsx-runtime`     | JSX automatic runtime (`jsx`, `jsxs`, `Fragment`)                                              |
| `@pyreon/solid-compat/jsx-dev-runtime` | Dev variant — same runtime                                                                     |

## API surface

| Category         | Exports                                                                                       |
| ---------------- | --------------------------------------------------------------------------------------------- |
| Signals          | `createSignal`, `createMemo`, `createEffect`, `createComputed` (alias), `createRenderEffect`, `createRoot`, `on`, `batch`, `untrack` |
| Lifecycle        | `onMount`, `onCleanup`                                                                         |
| Props            | `mergeProps`, `splitProps`, `children`                                                         |
| Context          | `createContext`, `useContext`                                                                  |
| Owner            | `getOwner`, `runWithOwner`                                                                     |
| Resources        | `createResource` (with `loading` / `error` / `latest` / `state`)                              |
| Stores           | `createStore`, `reconcile`, `unwrap`, `produce`                                                |
| Transitions      | `startTransition`, `useTransition`                                                             |
| Selectors        | `createSelector`                                                                               |
| Iteration        | `<For>`, `<Index>`, `mapArray`, `indexArray`                                                   |
| Control flow     | `<Show>`, `<Switch>`, `<Match>`, `<Dynamic>`, `<Portal>`, `<ErrorBoundary>`, `<Suspense>`     |
| Observables      | `observable`, `from`                                                                           |
| Misc             | `lazy`, `createDeferred`, `createReaction`, `catchError`, `createUniqueId`, `DEV`              |
| Render           | `render(code, element)`, `hydrate(code, element)`                                              |

## Drop-in compat mode

`@pyreon/vite-plugin` can alias every `solid-js` import to this package — no code changes:

```ts
// vite.config.ts
import pyreon from '@pyreon/vite-plugin'
export default { plugins: [pyreon({ compat: 'solid' })] }
```

`tsconfig.json`:

```jsonc
{
  "compilerOptions": {
    "jsx": "preserve",
    "jsxImportSource": "@pyreon/solid-compat"
  }
}
```

## `createResource` state

`resource.state` mirrors real SolidJS and is one of five values, derived reactively from the resource's loading/error/value signals:

| State          | Meaning                                                       |
| -------------- | ------------------------------------------------------------ |
| `'unresolved'` | No value yet AND not loading (initial, before the first fetch) |
| `'pending'`    | Loading AND no resolved value yet (first load)               |
| `'ready'`      | Has a resolved value, not loading                            |
| `'refreshing'` | Loading BUT a previous resolved value exists                 |
| `'errored'`    | The fetch rejected                                           |

```tsx
const [data] = createResource(() => fetch('/api/x').then((r) => r.json()))
data.state // 'pending' → 'ready'
data.loading // boolean
data.error // Error | undefined
data.latest // last resolved value (kept during a refresh)
```

There is no `.pending` property — it is not a real Solid `Resource` field. Use `.state === 'pending'` (or `.loading`) instead.

## Transitions are no-ops

`startTransition` and `useTransition` are stubs for source compatibility — they do NOT defer work. `startTransition(fn)` runs `fn` synchronously, and `useTransition()`'s `isPending` accessor always returns `false`. Pyreon has no concurrent / time-slicing scheduler, so transitions provide no behavioral benefit here.

## Not supported

Several real SolidJS APIs are not implemented. Importing them will fail (they are not exported) rather than silently misbehave:

- **Mutable stores** — `createMutable`, `modifyMutable` (use `createStore` or `@pyreon/reactivity`'s `createStore`).
- **`onError`** — register error handling via `<ErrorBoundary>` instead.
- **`isServer`** — use `@pyreon/reactivity`'s `isServer` / `isClient`.
- **SSR entry points** — `renderToString`, `renderToStringAsync`, `renderToStream`, `HydrationScript`, `NoHydration`, `Assets`. Solid's canonical SSR pipeline is out of scope; use Pyreon's own SSR (`@pyreon/runtime-server` / `@pyreon/server`).
- **`dom-expressions` codegen helpers** — `template`, `insert`, `spread`, `classList`, `delegateEvents`, etc. This package uses Pyreon's own JSX compiler, not Solid's `babel-plugin-jsx-dom-expressions`.

## Gotchas

- **Solid's babel-plugin-jsx-dom-expressions is NOT used.** This package relies on Pyreon's own JSX compiler. Components re-run on state change (coarse, per-component) rather than Solid's fine-grained per-node updates — output and lifecycle are correct, the codegen + update granularity differ.
- **`createStore` mutation tracking covers the common shapes** (top-level set, nested path set, function updaters). Deep proxy semantics in unusual edge cases may diverge from Solid's implementation.
- **`createResource`'s `mutate` / `refetch`** work but are implemented as imperative writes to the underlying Pyreon signal — not a fully transparent observer of an external fetcher.
- **`render`'s cleanup return value** maps to Pyreon's `mount()` cleanup function — semantically equivalent.

## Documentation

Full docs: [pyreon.dev/docs/solid-compat](https://pyreon.dev/docs/solid-compat) (or `docs/src/content/docs/solid-compat.md` in this repo).

## License

MIT
