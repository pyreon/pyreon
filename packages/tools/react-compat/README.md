# @pyreon/react-compat

React-compatible API shim — write React-style hooks that run on Pyreon's reactive engine.

`@pyreon/react-compat` is a near-full React 19 surface (`useState`, `useEffect`, `useReducer`, `useRef`, `useId`, `useSyncExternalStore`, `useTransition`, `useDeferredValue`, `useImperativeHandle`, `useActionState`, `useOptimistic`, `use`, `useLayoutEffect`, `useInsertionEffect`, plus `forwardRef`, `memo`, `lazy`, `Suspense`, `createContext`, `createPortal`, `cloneElement`, `Children`, `StrictMode`, `Profiler`, `Component`, `PureComponent`) backed by Pyreon's signal-based reactivity. The `./dom` subpath provides `createRoot` as a drop-in for `react-dom/client`. It runs the **value + re-render model**: `useState` returns the value directly (not a getter), the component body re-runs on state change, hooks are positional, and `useEffect` / `useMemo` / `useCallback` honor their deps arrays — so most React code behaves identically, including hooks-rules ordering and stale-closure semantics. **This is a compat shim, not React** — it intentionally diverges in a few places where React's reconciliation model conflicts with Pyreon's per-component re-render. The escape hatch is to drop the compat layer and use Pyreon's native API directly.

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
    document.title = `Count: ${count}`
  }, [count])

  return (
    <div>
      <p>Count: {count}</p>
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

`@pyreon/react-compat` runs the **value + re-render model**: `useState` returns the value directly (not a getter), the component body re-runs on state change, and `useEffect` / `useMemo` / `useCallback` honor their deps arrays. So most React code — including hooks-rules ordering and stale-closure semantics — behaves identically. The genuine differences are:

| Behavior                                              | React                                      | `@pyreon/react-compat`                                                                                                                                                                                                              |
| ----------------------------------------------------- | ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Reactive engine                                       | VDOM diff + reconciliation                 | Pyreon signals driving a per-component re-render                                                                                                                                                                                       |
| **Nested child state across an _ancestor_ re-render** | Preserved (reconciliation by position/key) | **Reset** — a parent re-render rebuilds the child subtree, so a nested component's `useState` / `useReducer` / `useRef` revert to their initial values and `useEffect([])` re-fires. `memo` does not prevent this. Lift such state up, or avoid re-rendering the ancestor. |
| Class components                                      | Full lifecycle support                     | **Unsupported** — `Component` / `PureComponent` are stubs; `setState` / `forceUpdate` warn-and-no-op, lifecycle methods never fire, `render()` returns `null`. Use function components with hooks. |
| Concurrent mode                                       | `useTransition` / `useDeferredValue` defer updates | **No-ops** — all updates are synchronous; `useTransition` returns `[false, fn => fn()]`, `useDeferredValue` / `startTransition` / `flushSync` are synchronous pass-throughs |
| `useLayoutEffect` / `useInsertionEffect`              | Distinct timing (sync before paint / before mutations) | Same as `useEffect` — Pyreon has no layout/paint distinction                                                                                                                                                                |
| `version`                                             | Real React version                         | Reports `19.0.0-pyreon` — gates on React 19 work; exact-version equality won't match                                                                                                                                                |

### Hooks behave like React

`useState` returns the value directly and the component re-runs on state change — no getter call:

```tsx
const [count, setCount] = useState(0)
console.log(count) // 0 — the value, exactly like React
```

Because the component re-runs, hooks are positional (call them at the top level, not in conditions/loops) and closures follow the usual React rules — use the updater form for the latest value inside long-lived callbacks:

```tsx
useEffect(() => {
  const id = setInterval(() => {
    setCount((prev) => prev + 1) // updater form reads the latest
  }, 1000)
  return () => clearInterval(id)
}, [])
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

- **Nested child state resets when an ancestor re-renders.** A parent re-render rebuilds the whole child subtree, so a nested component's `useState` / `useReducer` / `useRef` revert to their initial values and its `useEffect([])` runs again (re-subscribing / re-fetching). Keep state that must survive ancestor re-renders lifted up, or split the re-rendering ancestor out. (`memo` does not prevent this — the subtree is still rebuilt.)
- **Class components are unsupported stubs.** `Component` / `PureComponent` exist for import compatibility, but `setState` / `forceUpdate` warn-and-no-op, lifecycle methods never fire, and `render()` returns `null`. Use function components with hooks; use `onMount` / `onUnmount` from `@pyreon/core` for lifecycle and an `ErrorBoundary` component for error handling.
- **Concurrent-mode APIs are synchronous.** `useTransition` returns `[false, fn => fn()]`, `useDeferredValue` returns the value as-is, and `startTransition` / `flushSync` run synchronously — Pyreon has no concurrent mode, so these are kept for compatibility but defer nothing.
- **`Children` API is supported** (`map`, `forEach`, `count`, `toArray`, `only`) but works on Pyreon `VNodeChild` shapes.
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

Full docs: [pyreon.dev/docs/react-compat](https://pyreon.dev/docs/react-compat) (or `docs/src/content/docs/react-compat.md` in this repo).

## License

MIT
