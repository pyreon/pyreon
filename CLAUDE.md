# Pyreon — Signal-Based UI Framework

## Overview
Full-stack UI framework with fine-grained reactivity (signals). SSR, SSG, islands, SPA.
All packages under `@pyreon/*` scope.

## Benchmark Results (happy-dom)
Pyreon beats ALL frameworks on every benchmark except creation (ties vanilla).
- partialUpdate: 142µs (30x faster than vanilla)
- selectRow: 88µs (56x faster)
- swapRows: 159µs (28x faster)
- create1k: 8.1ms (#1)

## Package Overview
| Package | Description |
|---|---|
| `@pyreon/reactivity` | signal, computed, effect, batch, createSelector, createStore |
| `@pyreon/core` | VNode, h(), Fragment, lifecycle, context, JSX runtime, Suspense, ErrorBoundary |
| `@pyreon/runtime-dom` | DOM renderer, mount, hydrateRoot, Transition, TransitionGroup, KeepAlive |
| `@pyreon/compiler` | JSX transform with smart `shouldWrap`, static hoisting |
| `@pyreon/store` | defineStore, resetStore, resetAllStores |
| `@pyreon/runtime-server` | renderToString, renderToStream |
| `@pyreon/router` | hash+history+SSR, context-based, prefetching, guards, loaders |
| `@pyreon/head` | useHead, HeadProvider, renderWithHead |
| `@pyreon/model` | reactive models with patch tracking |
| `@pyreon/query` | useQuery, useMutation, QuerySuspense, dehydrate/hydrate |
| `@pyreon/server` | createHandler (SSR), prerender (SSG), island(), middleware |
| `@pyreon/vite-plugin` | JSX transform + SSR dev middleware |
| `@pyreon/react-compat` | useState, useEffect, useMemo, lazy, Suspense shims |

UI component packages (`@pyreon/styler`, `@pyreon/hooks`, `@pyreon/elements`, etc.) live in a separate repo: `pyreon/ui-system`.

## Key Architectural Patterns

### Workspace resolution (no build needed)
Each package.json has `"bun": "./src/index.ts"` in exports.
Root tsconfig has `"customConditions": ["bun"]`.

### Signal implementation
`signal<T>()` returns callable function with `.set()` and `.update()`.
Subscribers tracked via `Set<() => void>`. Batch uses pointer swap.

### VNode / h() types
- `h<P extends Props>(type, props, ...children)` — children stored in `vnode.children`
- Components must merge: `props.children = vnode.children.length === 1 ? vnode.children[0] : vnode.children`
- `ComponentFn<P> = (props: P) => VNode | null`

### Router
Context-based: `RouterContext = createContext<RouterInstance | null>(null)`.
`RouterProvider` pushes to context stack + sets module fallback.
Hash mode uses `history.pushState` (not `window.location.hash`) to avoid double-update.

### SSR
`renderToString(vnode)` + `renderToStream(vnode)` with Suspense streaming.
`mergeChildrenIntoProps(vnode)` called before `runWithHooks` in both paths.
`runWithRequestContext(fn)` isolates context + store per request via ALS.

### Island Architecture
`island(loader, { name, hydrate })` → async ComponentFn → `<pyreon-island>` element.
Client: `hydrateIslands({ Name: () => import(...) })` — strategies: load, idle, visible, media, never.

### JSX Compiler
`shouldWrap` only wraps if `containsCall(node)` is true.
Static JSX nodes hoisted to module scope as `const _$h0 = ...`.

### Context providing pattern
Uses `pushContext(new Map([[ctx.id, value]]))` + `onUnmount(() => popContext())`.

### onMount signature
`onMount(fn: () => CleanupFn | undefined)` — callbacks must return `undefined`, not `void`.

### exactOptionalPropertyTypes
Enabled in root tsconfig — optional properties need explicit `| undefined` when assigned from functions that may return undefined.

## Common Issues & Fixes
- `ComponentFn<{ name: string }>` not assignable → solved by generic h()
- `@pyreon/reactivity` missing from deps → add to package.json + `bun install`
- Biome `noNonNullAssertion` → use `if (!x) return` guard
- SSR empty render → forgot `mergeChildrenIntoProps` in renderComponent
- DOM tests need happy-dom preload (bunfig.toml in each package)
- Vite resolves `dist/` not `src/` → add `resolve.conditions: ["bun"]` to vite.config.ts

## Testing
```bash
bun test                              # all tests
cd packages/runtime-dom && bun test   # DOM tests (needs happy-dom preload)
cd packages/router && bun test        # router tests (needs happy-dom preload)
```
