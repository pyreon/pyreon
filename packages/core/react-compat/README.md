# @pyreon/react-compat

React-compatible API shim that runs on Pyreon's signal-based reactive engine. Migrate React code by swapping the import path.

## Install

```bash
bun add @pyreon/react-compat
```

## Quick Start

```tsx
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

### Using Refs and Context

```tsx
import { useRef, useEffect, createContext, useContext } from "@pyreon/react-compat"

const ThemeContext = createContext("light")

function ThemeDisplay() {
  const theme = useContext(ThemeContext)
  const divRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    console.log("mounted, div is:", divRef.current)
    return () => console.log("unmounted")
  }, [])

  return <div ref={divRef}>Current theme: {theme}</div>
}

function App() {
  return (
    <ThemeContext.Provider value="dark">
      <ThemeDisplay />
    </ThemeContext.Provider>
  )
}
```

### Reducer Pattern

```tsx
import { useReducer } from "@pyreon/react-compat"

type Action = { type: "increment" } | { type: "decrement" }

function reducer(state: number, action: Action) {
  switch (action.type) {
    case "increment": return state + 1
    case "decrement": return state - 1
  }
}

function Counter() {
  const [count, dispatch] = useReducer(reducer, 0)
  return (
    <div>
      <span>{count}</span>
      <button onClick={() => dispatch({ type: "increment" })}>+</button>
      <button onClick={() => dispatch({ type: "decrement" })}>-</button>
    </div>
  )
}
```

### Lazy Loading

```tsx
import { lazy, Suspense } from "@pyreon/react-compat"

const HeavyChart = lazy(() => import("./HeavyChart"))

function Dashboard() {
  return (
    <Suspense fallback={<p>Loading chart...</p>}>
      <HeavyChart data={[1, 2, 3]} />
    </Suspense>
  )
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
