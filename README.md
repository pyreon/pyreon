# Pyreon

A signal-based UI framework with fine-grained reactivity. No virtual DOM, no component re-renders — only the exact DOM nodes that depend on a changed signal are updated.

## Why Pyreon

- **Components run once.** State changes update individual DOM nodes, not entire component subtrees.
- **No dependency arrays.** Signals track their own subscribers automatically.
- **~6 kB gzip** for core + runtime-dom. Tree-shakeable — only what you use ships to the client.
- **Full-stack.** SSR streaming, static site generation, island architecture, and client-side SPA — all from one framework.
- **React migration path.** `@pyreon/react-compat` lets you migrate file-by-file with familiar `useState`/`useEffect` APIs.

## Quick Start

```bash
bun add @pyreon/core @pyreon/reactivity @pyreon/runtime-dom
bun add @pyreon/vite-plugin --dev
```

**vite.config.ts**

```ts
import { defineConfig } from 'vite'
import pyreonPlugin from '@pyreon/vite-plugin'

export default defineConfig({
  plugins: [pyreonPlugin()],
})
```

**tsconfig.json**

```json
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "@pyreon/core"
  }
}
```

**src/App.tsx**

```tsx
import { signal } from '@pyreon/reactivity'

function Counter() {
  const count = signal(0)
  return (
    <div>
      <button onClick={() => count.update((n) => n - 1)}>-</button>
      <span>{count()}</span>
      <button onClick={() => count.update((n) => n + 1)}>+</button>
    </div>
  )
}

export default Counter
```

**src/main.tsx**

```tsx
import { mount } from '@pyreon/runtime-dom'
import Counter from './App'

mount(<Counter />, document.getElementById('app')!)
```

The `count()` call inside JSX is a reactive getter. Pyreon wraps it in an effect automatically, so only that text node updates when `count` changes. The `Counter` function itself runs exactly once.

## Packages

| Package                                              | Description                                                                                                      |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| [`@pyreon/reactivity`](packages/reactivity/)         | `signal`, `computed`, `effect`, `batch`, `createSelector`, `createStore`                                         |
| [`@pyreon/core`](packages/core/)                     | `h()`, JSX runtime, `Fragment`, `For`, `Show`, `Portal`, `Suspense`, `ErrorBoundary`, `lazy`, context, lifecycle |
| [`@pyreon/runtime-dom`](packages/runtime-dom/)       | `mount()`, `hydrateRoot()`, `Transition`, `TransitionGroup`, `KeepAlive`                                         |
| [`@pyreon/runtime-server`](packages/runtime-server/) | `renderToString()`, `renderToStream()`                                                                           |
| [`@pyreon/compiler`](packages/compiler/)             | JSX transform with smart `shouldWrap`, static hoisting                                                           |
| [`@pyreon/vite-plugin`](packages/vite-plugin/)       | Vite integration — JSX transform, `.pyreon` files, HMR                                                           |
| [`@pyreon/router`](packages/router/)                 | Hash/history router, nested routes, guards, loaders, prefetching                                                 |
| [`@pyreon/head`](packages/head/)                     | `useHead()` — reactive document head management with SSR                                                         |
| [`@pyreon/server`](packages/server/)                 | `createHandler` (SSR), `prerender` (SSG), `island()` architecture                                                |
| [`@pyreon/react-compat`](packages/react-compat/)     | `useState`, `useEffect`, `useMemo`, `lazy`, `Suspense` shims for migration                                       |

## How It Works

```
Signal write → notify subscribers → re-run affected effects → patch DOM nodes
```

There is no virtual DOM tree. There is no diffing pass. Each signal maintains a `Set<Effect>` of subscribers. When a signal is written, only those effects re-run, and each effect updates exactly one DOM node.

**React (every state change):**

```
setState → re-run component → build VDOM → diff VDOM → patch DOM
```

**Pyreon (every signal write):**

```
signal.set() → re-run 1 effect → update 1 DOM node
```

## Framework Comparison

| Feature             | React 18           | Vue 3              | SolidJS              | Pyreon                 |
| ------------------- | ------------------ | ------------------ | -------------------- | ---------------------- |
| Reactivity          | VDOM + re-render   | Proxy + VDOM       | Fine-grained signals | Fine-grained signals   |
| Component re-runs   | Every state change | Every state change | Never                | Never                  |
| SSR streaming       | Yes                | Yes                | Yes                  | Yes                    |
| Island architecture | No                 | No                 | Partial              | Yes                    |
| Bundle (core)       | ~42 kB             | ~34 kB             | ~7 kB                | ~6 kB                  |
| React migration     | —                  | Partial            | None                 | `@pyreon/react-compat` |

## Documentation

- [Getting Started](docs/index.md) — overview and installation
- [Reactivity](docs/reactivity.md) — signals, computed, effects, batch
- [Components & JSX](docs/components.md) — component model, VNode, children
- [Lifecycle Hooks](docs/lifecycle.md) — onMount, onUnmount, onUpdate, onErrorCaptured
- [Context](docs/context.md) — dependency injection
- [Lists](docs/lists.md) — For, keyed rendering, createTemplate
- [Portals](docs/portals.md) — rendering into separate DOM containers
- [Suspense & ErrorBoundary](docs/suspense.md) — lazy loading, error recovery
- [Router](docs/router.md) — client-side routing, guards, loaders, prefetching
- [Head Management](docs/head.md) — document title, meta, link tags
- [SSR & SSG](docs/ssr.md) — server rendering and static generation
- [Islands](docs/islands.md) — partial hydration architecture
- [Security](docs/security.md) — HTML sanitization, XSS prevention
- [Testing](docs/testing.md) — testing patterns and utilities
- [Performance](docs/performance.md) — optimization techniques
- [Vite Plugin](docs/vite-plugin.md) — project setup and HMR
- [React Migration](docs/migration-react.md) — step-by-step migration guide
- [React Compat](docs/react-compat.md) — API compatibility layer

## Development

```bash
# Install dependencies
bun install

# Run all tests
bun test

# Run tests for a specific package
cd packages/runtime-dom && bun test

# Typecheck
bun run typecheck
```

The monorepo uses Bun workspaces. Each package resolves `src/` directly via the `"bun"` export condition — no build step needed during development.

## License

MIT
