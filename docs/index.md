# Nova Framework

Nova is a fine-grained reactivity framework for building user interfaces. It compiles to efficient DOM operations where only the exact nodes that depend on a changed signal are updated — no virtual DOM diffing, no component re-renders.

## Why Nova

| Pain point | React/Vue | Nova |
|---|---|---|
| Re-renders | Whole component subtree re-renders on state change | Signal updates patch only the affected DOM node |
| Stale closures | Effect deps arrays, `useCallback`, `useMemo` boilerplate | No deps arrays — tracking is automatic |
| Bundle size | React DOM ~42 kB gzip | Nova core + runtime-dom ~6 kB gzip |
| SSR | Requires hydration of full component tree | Selective hydration, stream-first |
| Migration | — | `@pyreon/react-compat` lets you migrate file-by-file |

## Installation

```bash
bun add @pyreon/core @pyreon/reactivity @pyreon/runtime-dom
```

For Vite projects:

```bash
bun add @pyreon/vite-plugin --dev
```

## Quick Start

**tsconfig.json**

```json
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "@pyreon/core"
  }
}
```

**Counter component**

```tsx
import { signal } from "@pyreon/reactivity"
import { mount } from "@pyreon/runtime-dom"

function Counter() {
  const count = signal(0)
  return (
    <div>
      <button onClick={() => count.update(n => n - 1)}>-</button>
      <span>{count()}</span>
      <button onClick={() => count.update(n => n + 1)}>+</button>
    </div>
  )
}

mount(document.getElementById("app")!, <Counter />)
```

The `count()` call inside JSX is a reactive getter. Nova wraps it in an effect automatically, so only that text node is updated when `count` changes. The `Counter` function itself runs exactly once.

## Package Overview

| Package | Purpose |
|---|---|
| `@pyreon/reactivity` | Primitives: `signal`, `computed`, `effect`, `batch`, `createSelector` |
| `@pyreon/core` | `h()`, JSX runtime, `Fragment`, `For`, `Portal`, `Suspense`, `ErrorBoundary`, `lazy`, context, lifecycle hooks |
| `@pyreon/runtime-dom` | `mount()`, `hydrateRoot()`, `createTemplate()` |
| `@pyreon/runtime-server` | `renderToString()`, `renderToStream()` |
| `@pyreon/router` | Hash/history router, guards, lazy routes |
| `@pyreon/store` | `defineStore()` — composable global state |
| `@pyreon/compiler` | Babel/TypeScript JSX transform |
| `@pyreon/vite-plugin` | Vite plugin — `.nova` files, HMR |
| `@pyreon/react-compat` | Drop-in React API shims for incremental migration |

## Framework Comparison

| Feature | React 18 | Vue 3 | SolidJS | Nova |
|---|---|---|---|---|
| Reactivity model | VDOM + re-render | Proxy + VDOM | Fine-grained signals | Fine-grained signals |
| Component re-runs | On every state change | On every state change | Never | Never |
| Template syntax | JSX | Template / JSX | JSX | JSX |
| SSR streaming | Yes | Yes | Yes | Yes |
| Bundle (core) | ~42 kB | ~34 kB | ~7 kB | ~6 kB |
| React migration path | — | Partial | None | `@pyreon/react-compat` |
| TypeScript | Good | Good | Good | Excellent |

## Next Steps

- [Reactivity primitives](./reactivity.md) — signals, computed, effects
- [Components & JSX](./components.md) — component model, VNode, children
- [Lifecycle hooks](./lifecycle.md) — onMount, onUnmount, cleanup
- [Context](./context.md) — dependency injection
- [Lists](./lists.md) — For, keyed rendering
- [Router](./router.md) — client-side routing
- [Store](./store.md) — global state management
- [SSR](./ssr.md) — server rendering and hydration
- [Vite plugin](./vite-plugin.md) — project setup
- [React compat](./react-compat.md) — migration shims
- [Migration guide](./migration-react.md) — step-by-step from React
