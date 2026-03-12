# Architecture Rules

## Monorepo Structure
- All packages under `packages/` with `@pyreon/*` scope
- Workspace resolution via `"bun"` condition — no build step for dev
- Dependencies between packages use workspace protocol

## Package Layers (dependency order)
1. `@pyreon/reactivity` — standalone, no framework deps
2. `@pyreon/core` — depends on reactivity
3. `@pyreon/compiler` — standalone babel transform
4. `@pyreon/runtime-dom` — depends on core + reactivity
5. `@pyreon/runtime-server` — depends on core + reactivity
6. `@pyreon/router` — depends on core + reactivity
7. `@pyreon/head` — depends on core
8. `@pyreon/server` — depends on core + runtime-server
9. `@pyreon/vite-plugin` — depends on compiler
10. Compat packages — depend on core + reactivity

## Performance Principles
- `_tpl()` (cloneNode) + `_bind()` for compiled templates — 0 VNode allocations
- `TextNode.data` for reactive text (not `.textContent`)
- Signal subscriptions via `Set<() => void>`, batch uses pointer swap
- `mountFor` keyed reconciler with LIS algorithm
- `_elementDepth` optimization: nested elements skip DOM removal closures
- `renderEffect` uses local array for deps (lighter than `effect()`)

## SSR
- `renderToString(vnode)` + `renderToStream(vnode)` with Suspense streaming
- Always call `mergeChildrenIntoProps(vnode)` before `runWithHooks`
- `runWithRequestContext(fn)` isolates context + store per request via ALS
- Island architecture: `island(loader, { name, hydrate })` for partial hydration
