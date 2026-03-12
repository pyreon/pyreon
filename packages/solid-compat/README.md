# @pyreon/solid-compat

SolidJS-compatible API shim that runs on Pyreon's signal-based reactive engine. Migrate Solid code by swapping the import path.

## Install

```bash
bun add @pyreon/solid-compat
```

## Quick Start

```ts
// Replace:
// import { createSignal, createEffect } from "solid-js"
// With:
import { createSignal, createEffect } from "@pyreon/solid-compat"

function Counter() {
  const [count, setCount] = createSignal(0)
  createEffect(() => console.log("count:", count()))
  return <button onClick={() => setCount((c) => c + 1)}>{count}</button>
}
```

## Key Differences from SolidJS

- **Same mental model.** Pyreon's reactivity is signal-based, just like Solid.
- **`createEffect` cleanup is not supported.** Pyreon's `effect()` does not use return values as cleanup functions.
- **`lazy` throws promises for Suspense.** Works with `<Suspense>` boundaries.

## API

### Primitives

- **`createSignal(initial)`** -- returns `[getter, setter]`.
- **`createEffect(fn)`** -- reactive side effect.
- **`createRenderEffect(fn)`** -- alias for `createEffect`.
- **`createComputed(fn)`** -- alias for `createEffect`.
- **`createMemo(fn)`** -- returns a computed getter.
- **`createRoot(fn)`** -- run in a new reactive scope with `dispose`.
- **`on(deps, fn)`** -- explicit dependency tracking.

### Utilities

- **`batch(fn)`** -- coalesce multiple signal writes.
- **`untrack(fn)`** -- read signals without tracking.
- **`mergeProps(...sources)`** -- merge multiple props objects (supports symbol keys).
- **`splitProps(props, ...keys)`** -- split props into groups (supports symbol keys).
- **`children(fn)`** -- resolve reactive children.

### Lifecycle

- **`onMount(fn)`** -- run after component mounts.
- **`onCleanup(fn)`** -- run on component unmount.

### Context

- **`createContext(defaultValue)`** -- create a context.
- **`useContext(ctx)`** -- read a context value.

### Ownership

- **`getOwner()`** -- get the current reactive scope.
- **`runWithOwner(owner, fn)`** -- run in a specific scope.

### Reactivity

- **`createSelector(source)`** -- O(1) equality selector.

### Components

- **`lazy(loader)`** -- dynamic import wrapper, throws promises for `<Suspense>`.
- **`Show`**, **`Switch`**, **`Match`**, **`For`** -- control flow components.
- **`Suspense`**, **`ErrorBoundary`** -- boundary components.
