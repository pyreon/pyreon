# React Compatibility Layer

`@pyreon/react-compat` provides React-API-compatible shims built on top of Nova's reactivity primitives. It lets you migrate a React codebase to Nova file-by-file without rewriting every component at once.

## Installation

```bash
bun add @pyreon/react-compat
```

## Import Change

Replace the `react` import with `@pyreon/react-compat`:

```ts
// Before
import { useState, useEffect, useMemo, useRef } from "react"

// After
import { useState, useEffect, useMemo, useRef } from "@pyreon/react-compat"
```

For JSX factory, update `tsconfig.json`:

```json
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "@pyreon/core"
  }
}
```

## Full API Mapping

| React API | Nova equivalent | Available in react-compat |
|---|---|---|
| `useState(init)` | `signal(init)` + `.set()` | Yes |
| `useReducer(r, init)` | `signal` + custom reducer | Yes |
| `useEffect(fn, deps)` | `effect(fn)` (deps ignored) | Yes |
| `useMemo(fn, deps)` | `computed(fn)` (deps ignored) | Yes |
| `useCallback(fn, deps)` | returns `fn` unchanged | Yes |
| `useRef(init)` | `createRef(init)` | Yes |
| `useContext(ctx)` | `useContext(ctx)` | Yes |
| `createContext(def)` | `createContext(def)` | Yes |
| `useId()` | incremental counter | Yes |
| `useTransition()` | `[false, fn => fn()]` | Yes (no-op shim) |
| `useDeferredValue(v)` | returns `v` unchanged | Yes (no-op shim) |
| `useImperativeHandle` | attaches methods to ref | Yes |
| `memo(Component)` | identity (Nova components run once) | Yes (identity) |
| `lazy(fn)` | `lazy(fn)` | Yes |
| `Suspense` | `Suspense` | Yes |
| `ErrorBoundary` | `ErrorBoundary` | Yes |
| `createPortal(c, el)` | `Portal` component | Yes |
| `batch(fn)` | `batch(fn)` | Yes (re-export) |
| `createSelector` | `createSelector` | Yes (re-export) |
| `forwardRef` | not needed (use ref prop directly) | No-op passthrough |
| Class components | not supported | No |
| `useLayoutEffect` | mapped to `onMount` | Yes |
| `React.Children` | not supported | No |
| `cloneElement` | not supported | No |
| Synthetic events | native DOM events used | N/A |

## useState

In React-compat, `useState` returns a `[getter, setter]` tuple. The getter is a **callable function** — you must call it to read the value.

```tsx
import { useState } from "@pyreon/react-compat"

function Counter() {
  const [count, setCount] = useState(0)

  return (
    <div>
      {/* Must call count() — not count */}
      <span>{count()}</span>
      <button onClick={() => setCount(n => n + 1)}>+</button>
    </div>
  )
}
```

This is the most common gotcha when migrating. React's `count` is a plain value; Nova's `count` is a signal (a function).

## useEffect

Deps array is **ignored** — Nova auto-tracks dependencies.

```tsx
// React (deps array required)
useEffect(() => {
  document.title = `Count: ${count}`
}, [count])

// Nova react-compat (deps ignored, auto-tracked)
useEffect(() => {
  document.title = `Count: ${count()}`
})
```

Cleanup works the same way — return a function:

```tsx
useEffect(() => {
  const id = setInterval(() => tick(), 1000)
  return () => clearInterval(id)
})
```

## useMemo

Deps array is **ignored** — Nova auto-tracks.

```tsx
// React
const filtered = useMemo(() =>
  items.filter(i => i.active), [items])

// Nova react-compat — same code, deps ignored
const filtered = useMemo(() =>
  items().filter(i => i.active))
// filtered is a computed getter — call filtered() to read
```

## useCallback

Returns the function unchanged (no memoization needed — components run once).

```tsx
const handleClick = useCallback(() => {
  setCount(n => n + 1)
}, [setCount])  // deps ignored
```

## useRef

```tsx
import { useRef } from "@pyreon/react-compat"

function Input() {
  const inputRef = useRef<HTMLInputElement>(null)

  onMount(() => {
    inputRef.current?.focus()
  })

  return <input ref={el => (inputRef.current = el)} />
}
```

## createContext / useContext

```tsx
import { createContext, useContext } from "@pyreon/react-compat"

const ThemeCtx = createContext("light")

function App() {
  return (
    <ThemeCtx.Provider value="dark">
      <Page />
    </ThemeCtx.Provider>
  )
}

function Page() {
  const theme = useContext(ThemeCtx)  // "dark"
  return <div class={`theme-${theme}`} />
}
```

## memo

In Nova, all components run once by definition. `memo()` is an identity function — it returns the component unchanged. There is no memoization needed.

```tsx
// React — prevents re-renders when props don't change
const Item = memo(({ name }: { name: string }) => <li>{name}</li>)

// Nova react-compat — memo is a no-op, same effect
const Item = memo(({ name }: { name: string }) => <li>{name}</li>)
```

## Gotchas

**You must call signal getters.** This is the biggest difference.

```tsx
// React
<span>{count}</span>

// Nova
<span>{count()}</span>
```

**Deps arrays are ignored.** Do not rely on them to throttle effect re-runs. If you have a `useEffect` that should only run once, it will still only run once in Nova — but because Nova's tracking detects no reactive dependencies inside, not because you passed `[]`.

**`useLayoutEffect` maps to `onMount`.** There is no distinction between layout effects and mount effects in Nova, since there is no batched re-render cycle.

**No class components.** `@pyreon/react-compat` does not support class components, `componentDidMount`, `componentWillUnmount`, `PureComponent`, or `Component`. Migrate class components to functions before switching to Nova.

**No React DevTools.** Nova does not integrate with the React DevTools browser extension.

**React ecosystem libraries will not work.** Libraries that depend on React internals (`react-dom`, `react-spring`, `react-query`, Radix UI, etc.) will not function with `@pyreon/react-compat`. Migrate components one at a time and keep React packages for components that still use them.

**Event names use native casing.** Nova uses `onClick` (React convention) but internally attaches native `addEventListener`. Non-standard React synthetic event handling (`onClickCapture`, `onChange` for input) follows standard DOM behavior.

**`className` vs `class`.** Nova uses `class`. The react-compat layer maps `className` to `class` automatically, so both work during migration.

## What Doesn't Work

| Feature | Status |
|---|---|
| Class components | Not supported |
| React DevTools | Not supported |
| `React.Children` utilities | Not supported |
| `cloneElement` | Not supported |
| `React.createRef` as class ref | Not supported |
| Suspense for data fetching | Use signals instead |
| Concurrent features (transitions, deferred values) | No-op shims only |
| Third-party React component libraries | Not compatible |
| Server Components | Not supported |
| React Native | Not supported |

## Migration Strategy

1. Start with leaf components (no children) that use only `useState`, `useEffect`, and `useMemo`.
2. Change the import, add `()` to state reads, remove deps arrays.
3. Move up the tree, migrating one component at a time.
4. Replace lists (`array.map` → `For`) for performance.
5. Replace `ReactDOM.createRoot` with `mount` from `@pyreon/runtime-dom`.

See [migration-react.md](./migration-react.md) for a full step-by-step guide.
