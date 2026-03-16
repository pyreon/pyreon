# Pyreon — Signal-Based UI Framework

## Overview
Full-stack UI framework with fine-grained reactivity (signals). SSR, SSG, islands, SPA.
All packages under `@pyreon/*` scope.

## Benchmark Results (Chromium via Playwright)
Pyreon (compiled) is fastest framework on all benchmarks:
- Create 1,000 rows: 9ms (1.00x) vs Solid 10ms, Vue 11ms, React 33ms
- Replace 1,000 rows: 10ms (1.00x) vs Solid 10ms, Vue 11ms, React 31ms
- Partial update: 5ms (1.00x) vs Solid 5ms, Vue 7ms, React 6ms
- Select row: 5ms (1.00x) vs Solid 5ms, Vue 5ms, React 8ms
- Create 10,000 rows: 103ms (1.00x) vs Solid 104ms, Vue 131ms, React 540ms

Key optimizations: `_tpl()` (cloneNode), `_bind()` (static-dep tracking), `TextNode.data`

## Package Overview
| Package | Description |
|---|---|
| `@pyreon/reactivity` | signal, computed, effect, batch, createSelector, createStore |
| `@pyreon/core` | VNode, h(), Fragment, lifecycle, context, JSX runtime, Suspense, ErrorBoundary, lazy(), Dynamic |
| `@pyreon/runtime-dom` | DOM renderer, mount, hydrateRoot, Transition, TransitionGroup, KeepAlive |
| `@pyreon/compiler` | JSX transform with smart `shouldWrap`, static hoisting |
| `@pyreon/runtime-server` | renderToString, renderToStream |
| `@pyreon/router` | hash+history+SSR, context-based, prefetching, guards, loaders |
| `@pyreon/head` | useHead, HeadProvider, renderWithHead |
| `@pyreon/server` | createHandler (SSR), prerender (SSG), island(), middleware |
| `@pyreon/vite-plugin` | JSX transform + SSR dev middleware + signal-preserving HMR |
| `@pyreon/react-compat` | useState, useEffect, useMemo, lazy, Suspense shims |

UI component packages (`@pyreon/styler`, `@pyreon/hooks`, `@pyreon/elements`, etc.) live in a separate repo: `pyreon/ui-system`.

## Key Architectural Patterns

### Workspace resolution (no build needed)
Each package.json has `"bun": "./src/index.ts"` in exports.
Root tsconfig has `"customConditions": ["bun"]`.

### Signal implementation
`signal<T>()` returns callable function with `.set()` and `.update()`.
Subscribers tracked via `Set<() => void>`. Batch uses pointer swap.

### JSX & VNode

- JSX configured via `jsxImportSource: "@pyreon/core"` in root tsconfig (`jsx: "preserve"`)
- JSX automatic runtime: `@pyreon/core/jsx-runtime` (jsx, jsxs, Fragment)
- `h<P extends Props>(type, props, ...children)` — lower-level API, children stored in `vnode.children`
- Components must merge: `props.children = vnode.children.length === 1 ? vnode.children[0] : vnode.children`
- `ComponentFn<P> = (props: P) => VNode | null`
- `<For each={items} by={r => r.id}>{r => <li>...</li>}</For>` — keyed list rendering
  - Prop is `by` (not `key`) because JSX extracts `key` as a special VNode reconciliation prop

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
Template emission: JSX element trees with ≥1 DOM element emit `_tpl()` + `_bind()`.
Supports mixed element+expression children (via `childNodes[]` indexing), multiple expressions, and fragment inlining.
Reactive text uses `document.createTextNode()` + `.data` (not `.textContent`).

### Context providing pattern
Uses `pushContext(new Map([[ctx.id, value]]))` + `onUnmount(() => popContext())`.

### onMount signature
`onMount(fn: () => CleanupFn | undefined)` — callbacks must return `undefined`, not `void`.

### Code Splitting & Dynamic Components
- `lazy(loader)` — wraps dynamic import with Suspense `__loading` integration
- `Dynamic({ component, ...props })` — renders component by reference or string tag
- Re-exported from `@pyreon/react-compat` for compatibility

### Signal-Preserving HMR (Vite plugin)
- Top-level `signal()` calls rewritten to `__hmr_signal(moduleId, name, signal, initialValue)`
- `import.meta.hot.dispose` saves signal values to `globalThis.__pyreon_hmr_registry__`
- On hot reload, signals restore their previous values instead of reinitializing
- Virtual module `virtual:pyreon/hmr-runtime` serves the HMR helpers

### Dev-Mode Warnings (`__DEV__`)
- `mount()` validates container is not null/undefined
- Component output validation (must return VNode, string, null, or function)
- Duplicate `by` keys in `<For>` loops logged as warnings
- Passing raw signal (function) as child instead of calling it
- All guarded by `__DEV__` — tree-shaken in production builds

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
bun run test                          # all package tests (via workspace filter)
cd packages/<name> && bun run test    # single package
cd packages/<name> && bun run test -- --coverage  # with coverage
```

DOM-dependent packages (runtime-dom, router, head, compat layers) use `environment: "happy-dom"` in vitest config.

## CI / Lint / Typecheck

```bash
bun run lint                          # lint all packages + examples (via workspace filter)
bun run typecheck                     # typecheck all packages + examples (via workspace filter)
bunx biome check --write .            # auto-fix lint + format
```

Every package and example must have `"lint": "biome check ."` and `"typecheck": "tsc --noEmit"` in scripts.
Examples use `noEmit: true` in tsconfig (not `rootDir`) since they include vite.config.ts.
