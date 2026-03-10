# @pyreon/react-compat

React-compatible API shim that runs on Pyreon's signal-based reactive engine. Migrate React code by swapping the import path.

## Install

```bash
bun add @pyreon/react-compat
```

## Quick Start

```ts
// Replace:
// import { useState, useEffect } from "react"
// With:
import { useState, useEffect } from "@pyreon/react-compat"

function Counter() {
  const [count, setCount] = useState(0)
  useEffect(() => {
    console.log("count changed:", count())
  })
  return <button onClick={() => setCount((c) => c + 1)}>{count}</button>
}
```

## Key Differences from React

- **No hooks rules.** Call hooks anywhere -- in loops, conditions, nested functions.
- **Components run once** (setup phase only), not on every render.
- **`useEffect` deps are ignored.** Pyreon tracks reactive dependencies automatically. Pass `[]` to run once on mount.
- **`useCallback` and `memo` are no-ops.** No re-renders means no stale closures.

## API

### State and Reducers

- **`useState(initial)`** -- returns `[getter, setter]`. Call `getter()` to read.
- **`useReducer(reducer, initial)`** -- returns `[getter, dispatch]`.

### Effects and Lifecycle

- **`useEffect(fn, deps?)`** -- reactive effect. `[]` deps means mount-only.
- **`useLayoutEffect`** -- alias for `onMount`.
- **`onMount`, `onUnmount`, `onUpdate`** -- Pyreon-native lifecycle hooks.

### Memoization

- **`useMemo(fn, deps?)`** -- returns a computed getter. Deps are ignored.
- **`useCallback(fn, deps?)`** -- returns `fn` as-is (no-op).

### Refs and Context

- **`useRef(initial?)`** -- returns `{ current }`.
- **`createContext(defaultValue)`**, **`useContext(ctx)`** -- same API as React.
- **`useId()`** -- stable unique string per component instance.

### Components

- **`memo(component)`** -- returns component unchanged (no-op).
- **`lazy(loader)`** -- dynamic import wrapper. Pair with `<Suspense>`.
- **`Suspense`**, **`ErrorBoundary`** -- boundary components.
- **`createPortal(children, target)`** -- portal rendering.

### Optimization (no-ops for compatibility)

- **`useTransition()`** -- returns `[false, (fn) => fn()]`.
- **`useDeferredValue(value)`** -- returns value as-is.
- **`useImperativeHandle(ref, init)`** -- exposes methods via ref.

### Utilities

- **`batch(fn)`** -- coalesce multiple signal writes.
- **`useErrorBoundary`** -- alias for `onErrorCaptured`.
- **`createSelector`** -- O(1) equality selector from `@pyreon/reactivity`.
- **`createElement` / `h`**, **`Fragment`** -- JSX runtime.
