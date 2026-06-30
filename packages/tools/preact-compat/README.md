# @pyreon/preact-compat

Preact-compatible API shim — write Preact-style code that runs on Pyreon's reactive engine.

`@pyreon/preact-compat` mirrors Preact's module structure (`@pyreon/preact-compat`, `@pyreon/preact-compat/hooks`, `@pyreon/preact-compat/signals`) and provides `h` / `Fragment` / `render` / `hydrate` / `Component` / `PureComponent` / `createContext` / `createRef` / `cloneElement` / `createPortal` / `lazy` / `Suspense` / `ErrorBoundary` plus the standard hooks set, all backed by Pyreon's signal-based reactivity. **This is a compat shim, not Preact** — it intentionally diverges in places where Preact's render-on-state-change model conflicts with Pyreon's run-once + fine-grained-reactivity model. The escape hatch is to drop the compat layer and use Pyreon's native API directly.

## Install

```bash
bun add @pyreon/preact-compat
```

Then alias your Preact imports (or use `pyreon({ compat: 'preact' })` from `@pyreon/vite-plugin` for zero code changes):

```ts
import { h, render, Fragment } from '@pyreon/preact-compat'
import { useState, useEffect } from '@pyreon/preact-compat/hooks'
import { signal, computed } from '@pyreon/preact-compat/signals'
```

## Quick start

```tsx
import { h, render } from '@pyreon/preact-compat'
import { useState, useEffect } from '@pyreon/preact-compat/hooks'

function Counter() {
  const [count, setCount] = useState(0)

  useEffect(() => {
    document.title = `Count: ${count}`
  }, [count])

  return (
    <div>
      <p>Count: {count}</p>
      <button onClick={() => setCount((prev) => prev + 1)}>+1</button>
    </div>
  )
}

render(<Counter />, document.getElementById('app')!)
```

## Subpath exports

| Subpath                                 | Surface                                                                                       |
| --------------------------------------- | --------------------------------------------------------------------------------------------- |
| `@pyreon/preact-compat`                 | Core: `h` / `createElement`, `Fragment`, `render`, `hydrate`, `Component`, `PureComponent`, `createContext` / `useContext`, `createRef`, `cloneElement`, `toChildArray`, `isValidElement`, `createPortal`, `lazy`, `Suspense`, `ErrorBoundary`, `options`, `version` |
| `@pyreon/preact-compat/hooks`           | `useState`, `useReducer`, `useEffect`, `useLayoutEffect`, `useMemo`, `useCallback`, `useRef`, `useId`, `memo`, `forwardRef`, `useImperativeHandle`, `useDebugValue`, `useTransition`, `useDeferredValue`, `useErrorBoundary` |
| `@pyreon/preact-compat/signals`         | `signal`, `computed`, `effect`, `batch`, `ReadonlySignal`, `WritableSignal`                   |
| `@pyreon/preact-compat/jsx-runtime`     | JSX automatic runtime (`jsx`, `jsxs`, `Fragment`)                                              |
| `@pyreon/preact-compat/jsx-dev-runtime` | Dev variant — same runtime, with source location info                                          |

## Key differences from Preact

`@pyreon/preact-compat` runs the **value + re-render model**: `useState` returns the value directly (not a getter), the component body re-runs on state change, and `useEffect` / `useMemo` / `useCallback` honor their deps arrays. So most Preact code — including hooks-rules ordering and stale-closure semantics — behaves identically. The genuine differences are:

| Behavior                                   | Preact                                       | `@pyreon/preact-compat`                                                                                                                                                                                                              |
| ------------------------------------------ | -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Reactive engine                            | VDOM diff + reconciliation                   | Pyreon signals driving a per-component re-render                                                                                                                                                                                       |
| **Nested child state across an _ancestor_ re-render** | Preserved (reconciliation by position/key) | **Reset** — a parent re-render rebuilds the child subtree, so a nested component's `useState` / `useReducer` / `useRef` revert to their initial values and `useEffect([])` re-fires. Lift such state up, or avoid re-rendering the ancestor. |
| Class lifecycle                            | Full lifecycle                               | `componentDidMount` / `componentDidUpdate` / `componentWillUnmount` / `shouldComponentUpdate` fire; `componentDidCatch` / `getDerivedStateFromError` / `getDerivedStateFromProps` / `getSnapshotBeforeUpdate` are **not** implemented (no class-based error boundaries) |
| `useLayoutEffect`                          | Fires synchronously before paint             | Same as `useEffect` — Pyreon has no paint distinction                                                                                                                                                                                |
| Signals `.value`                           | Native Preact Signals API                    | Wrapped Pyreon signals with the same `.value` interface                                                                                                                                                                              |
| `version`                                  | Real Preact version                          | Reports `10.0.0-pyreon` — gates on Preact 10 work; exact-version equality won't match                                                                                                                                                |

### Hooks behave like Preact

`useState` returns the value directly and the component re-runs on state change — no getter call:

```tsx
const [count, setCount] = useState(0)
console.log(count) // 0 — the value, exactly like Preact
```

Because the component re-runs, hooks are positional (call them at the top level, not in conditions/loops) and closures follow the usual Preact rules — use the updater form for the latest value inside long-lived callbacks:

```tsx
useEffect(() => {
  const id = setInterval(() => {
    setCount((prev) => prev + 1) // updater form reads the latest
  }, 1000)
  return () => clearInterval(id)
}, [])
```

### Signals subpath

`@pyreon/preact-compat/signals` mirrors `@preact/signals` — `signal(initial)` / `computed(fn)` / `effect(fn)` / `batch(fn)` — and the returned objects expose a `.value` getter/setter so existing `@preact/signals` consumer code keeps working.

## Drop-in compat mode

`@pyreon/vite-plugin` can alias every `preact` / `preact/hooks` / `@preact/signals` import to this package — no code changes:

```ts
// vite.config.ts
import pyreon from '@pyreon/vite-plugin'
export default { plugins: [pyreon({ compat: 'preact' })] }
```

`tsconfig.json`:

```jsonc
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "@pyreon/preact-compat"
  }
}
```

## Gotchas

- **Nested child state resets when an ancestor re-renders.** A parent re-render rebuilds the whole child subtree, so a nested component's `useState` / `useReducer` / `useRef` revert to their initial values and its `useEffect([])` runs again (re-subscribing / re-fetching). Keep state that must survive ancestor re-renders lifted up, or split the re-rendering ancestor out. (`memo` does not prevent this — the subtree is still rebuilt.)
- **Partial class lifecycle.** `componentDidMount` / `componentDidUpdate` / `componentWillUnmount` / `shouldComponentUpdate` fire; `componentDidCatch` / `getDerivedStateFromError` / `getDerivedStateFromProps` / `getSnapshotBeforeUpdate` are not implemented — **class-based error boundaries do not catch**. Use function components + `onMount` / `onUnmount` from `@pyreon/core` for lifecycle, and an `ErrorBoundary` component for error handling.
- **`version`** reports `10.0.0-pyreon` — code that gates on Preact 10 keeps working; code that asserts equality to a specific Preact version won't match.

## Documentation

Full docs: [pyreon.dev/docs/preact-compat](https://pyreon.dev/docs/preact-compat) (or `docs/src/content/docs/preact-compat.md` in this repo).

## License

MIT
