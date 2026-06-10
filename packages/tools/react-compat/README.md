# @pyreon/react-compat

React-compatible API shim — write React-style hooks that run on Pyreon's reactive engine.

`@pyreon/react-compat` is a near-full React 19 surface (`useState`, `useEffect`, `useReducer`, `useRef`, `useId`, `useSyncExternalStore`, `useTransition`, `useDeferredValue`, `useImperativeHandle`, `useActionState`, `useOptimistic`, `use`, `useLayoutEffect`, `useInsertionEffect`, plus `forwardRef`, `memo`, `lazy`, `Suspense`, `createContext`, `createPortal`, `cloneElement`, `Children`, `StrictMode`, `Profiler`, `Component`, `PureComponent`) backed by Pyreon's signal-based reactivity. The `./dom` subpath provides `createRoot` as a drop-in for `react-dom/client`. **This is a compat shim, not React** — it intentionally diverges where React's render-on-state-change model conflicts with Pyreon's run-once + fine-grained-reactivity model. The escape hatch is to drop the compat layer and use Pyreon's native API directly.

## Install

```bash
bun add @pyreon/react-compat
```

## Quick start

```tsx
import { useState, useEffect } from '@pyreon/react-compat'
import { createRoot } from '@pyreon/react-compat/dom'

function Counter() {
  const [count, setCount] = useState(0)

  useEffect(() => {
    document.title = `Count: ${count()}`
  })

  return (
    <div>
      <p>Count: {count()}</p>
      <button onClick={() => setCount((c) => c + 1)}>+1</button>
    </div>
  )
}

createRoot(document.getElementById('app')!).render(<Counter />)
```

## Subpath exports

| Subpath                                | Surface                                                                                       |
| -------------------------------------- | --------------------------------------------------------------------------------------------- |
| `@pyreon/react-compat`                 | Full React 19 surface — every hook listed above, plus `Fragment`, `h` / `createElement`, `createRef`, `cloneElement`, `Children`, `createContext` / `useContext`, `createPortal`, `forwardRef`, `memo`, `lazy`, `Suspense`, `ErrorBoundary`, `StrictMode`, `Profiler`, `Component`, `PureComponent`, `act`, `flushSync`, `startTransition`, `useDebugValue`, `isValidElement`, `version` |
| `@pyreon/react-compat/dom`             | `createRoot(container)` — drop-in for `react-dom/client`                                       |
| `@pyreon/react-compat/jsx-runtime`     | JSX automatic runtime (`jsx`, `jsxs`, `Fragment`)                                              |
| `@pyreon/react-compat/jsx-dev-runtime` | Dev variant — same runtime                                                                     |

## Key differences from React

| Behavior              | React                                  | `@pyreon/react-compat`                                                 |
| --------------------- | -------------------------------------- | ---------------------------------------------------------------------- |
| Component execution   | Re-runs render on every state change   | Runs **once** (setup phase)                                            |
| `useState` getter     | Returns the value directly             | Returns a **getter function** — call `count()` to read                 |
| `useEffect` deps      | Controls when the effect re-runs       | Deps array is **ignored** — Pyreon tracks dependencies automatically   |
| `useCallback`         | Memoizes across renders                | **No-op** — returns `fn` as-is                                         |
| `useMemo`             | Returns the memoized value             | Returns a **getter function** — call `value()` to read                 |
| `useLayoutEffect`     | Sync before paint                      | Same as `useEffect`                                                    |
| `useInsertionEffect`  | Library-injected CSS before mutations  | Same as `useEffect`                                                    |
| `useTransition`       | Returns `[isPending, startTransition]` | Same shape; `isPending` is a getter                                    |
| `useSyncExternalStore`| Subscribes via React's scheduler       | Same shape; getter return                                              |
| `memo`                | Bails on equal props                   | **No-op** — pass-through                                               |
| `forwardRef`          | Wraps for ref forwarding               | Pass-through; refs are first-class props                               |
| Class components      | Full lifecycle support                 | `setState` + `forceUpdate` work; lifecycle methods are not called      |
| Hooks rules           | Must be called at top level            | **No restrictions** — call anywhere in component setup                 |

### Read state via a getter

```tsx
// React
const [count, setCount] = useState(0)
console.log(count) // 0

// @pyreon/react-compat
const [count, setCount] = useState(0)
console.log(count()) // 0 — call the function
```

### `createRoot` from `./dom`

```tsx
import { createRoot } from '@pyreon/react-compat/dom'

const root = createRoot(document.getElementById('app')!)
root.render(<App />)
root.unmount()
```

## Drop-in compat mode

`@pyreon/vite-plugin` can alias every `react` / `react-dom` / `react-dom/client` import to this package — no code changes:

```ts
// vite.config.ts
import pyreon from '@pyreon/vite-plugin'
export default { plugins: [pyreon({ compat: 'react' })] }
```

`tsconfig.json`:

```jsonc
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "@pyreon/react-compat"
  }
}
```

## Gotchas

- **Run-once mental model.** Components don't re-run on state change. Read signals/getters where they're used, not destructured into locals at the top of the function.
- **`useEffect` / `useLayoutEffect` / `useInsertionEffect` deps are ignored.** Pyreon tracks dependencies automatically. Effects re-run when any signal they read changes.
- **`memo` / `useCallback` / `forwardRef` are no-ops.** Pyreon's run-once model + fine-grained reactivity removes their reason to exist.
- **`Children` API is supported** (`map`, `forEach`, `count`, `toArray`, `only`) but works on Pyreon `VNodeChild` shapes.
- **Class-component lifecycle methods don't fire.** Use `onMount` / `onUnmount` from `@pyreon/core` for lifecycle.
- **The DOM is fully replaced on re-render in the compat layer** — there's no VDOM diffing. Pre-captured `elementHandle()` references in tests will point at detached nodes; always re-query the DOM after a state change.
- **`version`** reports `19.0.0-pyreon` — code that gates on React 19 keeps working; code that asserts equality won't match.

## Third-party React hook library compatibility

`@pyreon/react-compat` re-implements React's PUBLIC hook surface (`useState`, `useEffect`, `useReducer`, `useMemo`, `useRef`, etc.). Third-party hook libraries that build on these PUBLIC hooks generally work.

**What works:**
- Libraries that compose only `useState` + `useEffect` + `useReducer` + `useMemo` + `useRef` + `useCallback` — e.g. ad-hoc form hooks, simple input controllers, debounce/throttle hooks.
- Libraries with a vanilla / framework-agnostic core: `zustand/vanilla`, `xstate`, `nanostores` — call them imperatively from a Pyreon component body, subscribe via `effect()` or `useEffect`.
- Libraries that use `useSyncExternalStore` for SSR-safe external-store subscription (Pyreon's react-compat ships `useSyncExternalStore` — verify on a per-library basis).

**What's known to NOT work (and why):**
- **`zustand/react` `useStore`** — relies on React's internal scheduler + concurrent-mode primitives that Pyreon's compat layer doesn't shim. Use `zustand/vanilla`'s `createStore` directly and subscribe via `effect()` instead.
- **`react-aria` hooks** — many depend on React's `useId` semantics + React-internal portal context that don't map 1:1. Some primitives work; the heavier composables (`useOverlay`, `useFocusScope`) often don't.
- **`@xyflow/react`** — uses React-internal store wiring (`useReactFlow`, `useStore` from `zustand/react`) that doesn't survive the compat boundary. Use the framework-agnostic `@xyflow/svelte` patterns + Pyreon-native primitives instead, or wait for a `@pyreon/flow` adapter (which exists but isn't 1:1).
- **`virtua` and other virtual-list libs that subscribe via `useSyncExternalStore` to a store updated by `useLayoutEffect`** — Pyreon's layout-effect timing isn't identical to React's commit phase; observable timing differences can break the scroll-state contract.

**Rule of thumb:** if the library only uses React's PUBLIC hooks (no `useSyncExternalStore` + custom-scheduler tricks, no React internals), it has a reasonable chance of working. If it has a `/vanilla` or `/core` framework-agnostic entry, prefer that — it's the supported integration path for any non-React reactive framework.

If you hit a library that should work but doesn't, file an issue with a minimal repro — many gaps are fixable by adding the matching shim to `@pyreon/react-compat`.

## Documentation

Full docs: [docs.pyreon.dev/docs/react-compat](https://docs.pyreon.dev/docs/react-compat) (or `docs/src/content/docs/react-compat.md` in this repo).

## License

MIT
