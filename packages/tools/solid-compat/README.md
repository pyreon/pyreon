# @pyreon/solid-compat

SolidJS-compatible API shim — write Solid-style code that runs on Pyreon's reactive engine.

`@pyreon/solid-compat` provides the SolidJS surface (`createSignal`, `createEffect`, `createMemo`, `createComputed`, `createRenderEffect`, `createResource`, `createSelector`, `createRoot`, `createStore`, `createContext`/`useContext`, `mergeProps`, `splitProps`, `untrack`, `batch`, lifecycle hooks `onMount` / `onCleanup`, control-flow components `<For>` / `<Show>` / `<Switch>` / `<Match>` / `<Index>` / `<Dynamic>` / `<Portal>` / `<ErrorBoundary>` / `<Suspense>`, transitions, observables, `reconcile` / `unwrap` / `produce`) all on Pyreon's reactive engine. Because Solid and Pyreon share the same mental model (fine-grained reactivity, run-once components, getter/setter signals), this is the thinnest compat layer — most APIs map nearly 1:1.

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
| Resources        | `createResource` (with `pending` / `loading` / `latest` / `state` / `error`)                  |
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

## Gotchas

- **Solid's babel-plugin-jsx-dom-expressions is NOT used.** This package relies on Pyreon's own JSX compiler — semantics are the same (run-once + fine-grained), the codegen differs.
- **`createStore` mutation tracking covers the common shapes** (top-level set, nested path set, function updaters). Deep proxy semantics in unusual edge cases may diverge from Solid's implementation.
- **`createResource`'s `mutate` / `refetch`** work but are implemented as imperative writes to the underlying Pyreon signal — not a fully transparent observer of an external fetcher.
- **`render`'s cleanup return value** maps to Pyreon's `mount()` cleanup function — semantically equivalent.

## Documentation

Full docs: [pyreon.dev/docs/solid-compat](https://pyreon.dev/docs/solid-compat) (or `docs/src/content/docs/solid-compat.md` in this repo).

## License

MIT
