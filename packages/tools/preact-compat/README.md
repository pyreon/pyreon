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
    document.title = `Count: ${count()}`
  })

  return (
    <div>
      <p>Count: {count()}</p>
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

| Behavior            | Preact                                | `@pyreon/preact-compat`                                                |
| ------------------- | ------------------------------------- | ---------------------------------------------------------------------- |
| Component execution | Re-runs render on every state change  | Runs **once** (setup phase)                                            |
| `useState` getter   | Returns the value directly            | Returns a **getter function** — call `count()` to read                 |
| `useEffect` deps    | Controls when the effect re-runs      | Deps array is **ignored** — Pyreon tracks dependencies automatically   |
| `useCallback`       | Memoizes across renders               | **No-op** — returns `fn` as-is                                         |
| `useMemo`           | Returns the memoized value            | Returns a **getter function** — call `value()` to read                 |
| `useLayoutEffect`   | Fires synchronously before paint      | Same as `useEffect`                                                    |
| Signals `.value`    | Native Preact Signals API             | Wrapped Pyreon signals with the same `.value` interface                |
| Class components    | Full lifecycle support                | `setState` and `forceUpdate` work; lifecycle methods are not called    |
| Hooks rules         | Must be called at top level           | **No restrictions** — call anywhere in component setup                 |

### Read state via a getter

```tsx
// Preact
const [count, setCount] = useState(0)
console.log(count) // 0

// @pyreon/preact-compat
const [count, setCount] = useState(0)
console.log(count()) // 0 — call the function
```

### No stale closures

Signal reads always return the current value. Preact-style `setInterval` callbacks that needed `[count]` deps to avoid stale closures Just Work without them:

```tsx
useEffect(() => {
  const id = setInterval(() => {
    setCount((prev) => prev + 1)   // always reads the latest
  }, 1000)
  return () => clearInterval(id)
})
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

- **Run-once mental model.** Components don't re-run on state change — read signals/getters where they're used, not destructured into locals at the top of the function.
- **`useEffect` deps are ignored.** Dependency tracking is automatic. Effects re-run when any signal they read changes.
- **`useCallback` is a no-op.** Pyreon doesn't need referential stability across renders because there are no renders.
- **Class-component lifecycle methods don't fire.** `setState` + `forceUpdate` work, but `componentDidMount` / `componentDidUpdate` / `componentWillUnmount` are not invoked. Use `onMount` / `onUnmount` from `@pyreon/core` for lifecycle.
- **`version`** reports `10.0.0-pyreon` — code that gates on Preact 10 keeps working; code that asserts equality to a specific Preact version won't match.

## Documentation

Full docs: [docs.pyreon.dev/docs/preact-compat](https://docs.pyreon.dev/docs/preact-compat) (or `docs/src/content/docs/preact-compat.md` in this repo).

## License

MIT
