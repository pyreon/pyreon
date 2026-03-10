# Pyreon Framework

Pyreon is a fine-grained reactivity framework for building user interfaces. It compiles to efficient DOM operations where only the exact nodes that depend on a changed signal are updated — no virtual DOM diffing, no component re-renders.

## Why Pyreon

| Pain point | React/Vue | Pyreon |
| --- | --- | --- |
| Re-renders | Whole component subtree re-renders on state change | Signal updates patch only the affected DOM node |
| Stale closures | Effect deps arrays, `useCallback`, `useMemo` boilerplate | No deps arrays — tracking is automatic |
| Bundle size | React DOM ~42 kB gzip | Pyreon core + runtime-dom ~6 kB gzip |
| SSR | Requires hydration of full component tree | Selective hydration, stream-first, island architecture |
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

### tsconfig.json

```json
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "@pyreon/core"
  }
}
```

### Counter component

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

mount(<Counter />, document.getElementById("app")!)
```

The `count()` call inside JSX is a reactive getter. Pyreon wraps it in an effect automatically, so only that text node is updated when `count` changes. The `Counter` function itself runs exactly once.

## Package Overview

| Package | Purpose |
| --- | --- |
| `@pyreon/reactivity` | Primitives: `signal`, `computed`, `effect`, `batch`, `createSelector` |
| `@pyreon/core` | `h()`, JSX runtime, `Fragment`, `For`, `Show`, `Portal`, `Suspense`, `ErrorBoundary`, `lazy`, context, lifecycle |
| `@pyreon/runtime-dom` | `mount()`, `hydrateRoot()`, `Transition`, `TransitionGroup`, `KeepAlive` |
| `@pyreon/runtime-server` | `renderToString()`, `renderToStream()` |
| `@pyreon/compiler` | JSX transform with smart `shouldWrap`, static hoisting |
| `@pyreon/vite-plugin` | Vite integration — JSX transform, `.pyreon` files, HMR |
| `@pyreon/router` | Hash/history router, nested routes, guards, loaders, prefetching |
| `@pyreon/store` | `defineStore()` — composable global state singletons |
| `@pyreon/head` | `useHead()` — reactive document head management with SSR |
| `@pyreon/model` | Reactive models with patch tracking, snapshots, middleware |
| `@pyreon/server` | `createHandler` (SSR), `prerender` (SSG), `island()` architecture |
| `@pyreon/react-compat` | `useState`, `useEffect`, `useMemo`, `lazy`, `Suspense` shims for migration |

## Framework Comparison

| Feature | React 18 | Vue 3 | SolidJS | Pyreon |
| --- | --- | --- | --- | --- |
| Reactivity model | VDOM + re-render | Proxy + VDOM | Fine-grained signals | Fine-grained signals |
| Component re-runs | On every state change | On every state change | Never | Never |
| Template syntax | JSX | Template / JSX | JSX | JSX |
| SSR streaming | Yes | Yes | Yes | Yes |
| Island architecture | No | No | Partial | Yes |
| Bundle (core) | ~42 kB | ~34 kB | ~7 kB | ~6 kB |
| React migration path | — | Partial | None | `@pyreon/react-compat` |
| TypeScript | Good | Good | Good | Excellent |

## Documentation

### Core Concepts

- [Reactivity](./reactivity.md) — signals, computed, effects, batch, createSelector
- [Components & JSX](./components.md) — component model, VNode, children, reactive props
- [Lifecycle Hooks](./lifecycle.md) — onMount, onUnmount, onUpdate, onErrorCaptured
- [Context](./context.md) — dependency injection across the component tree

### Rendering

- [Lists](./lists.md) — For, keyed rendering, createTemplate
- [Portals](./portals.md) — rendering into separate DOM containers
- [Suspense & ErrorBoundary](./suspense.md) — lazy loading, error recovery

### Routing & State

- [Router](./router.md) — client-side routing, guards, loaders, nested routes, prefetching
- [Store](./store.md) — global state management with defineStore
- [Model](./model.md) — reactive models with patch tracking and middleware

### Server

- [SSR & SSG](./ssr.md) — server rendering, static generation, createHandler
- [Islands](./islands.md) — partial hydration architecture
- [Head Management](./head.md) — document title, meta, link tags

### Security & Quality

- [Security](./security.md) — HTML sanitization, XSS prevention
- [Testing](./testing.md) — testing patterns and utilities
- [Performance](./performance.md) — optimization techniques and benchmarks

### Setup & Migration

- [Vite Plugin](./vite-plugin.md) — project setup, HMR, .pyreon files
- [React Compat](./react-compat.md) — API compatibility layer
- [Migration Guide](./migration-react.md) — step-by-step from React to Pyreon
