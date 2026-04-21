# Architecture Rules

## Monorepo Structure

- All packages under `packages/` with `@pyreon/*` scope
- Examples under `examples/` — also part of the workspace
- Workspace resolution via `"bun"` condition — no build step for dev
- Dependencies between packages use workspace protocol
- **Bootstrap on fresh install**: `postinstall` runs `scripts/bootstrap.ts` which builds all packages if any `lib/` directory is missing (~45s once, then no-op). This is required because Vite's config bundler hardcodes `conditions: ["node"]` and needs `lib/*.js` — not the TypeScript source. You do NOT need to run `bun run build` manually after cloning or creating a worktree.

## CI Requirements

- Every package and example must have `"lint": "oxlint ."` and `"typecheck": "tsc --noEmit"` scripts
- Root `lint` and `typecheck` run via `bun run --filter='*'` to cover all workspaces
- Always verify `bun run lint` and `bun run typecheck` pass before committing
- Examples use `noEmit: true` in tsconfig (not `rootDir`) since they include vite.config.ts

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
- **Devtools gated on `__DEV__`**: `compId` generation, `_mountingStack`, `registerComponent`/`unregisterComponent` are all behind `if (__DEV__)` — zero cost in production builds (Vite tree-shakes the entire devtools module)
- **Lazy allocation**: `EffectScope._effects`/`._updateHooks`, `LifecycleHooks.mount`/`.unmount`/`.update`/`.error`, and `mountCleanups` start as `null` — only allocated when first hook/effect is registered
- **makeReactiveProps scan-first**: scans for `REACTIVE_PROP` brand before allocating result object — static-only components (60%+) skip allocation entirely
- **omit() accepts pre-built `Set<string>`**: rocketstyle caches the Set at definition time, avoids per-mount Set construction
- **Unistyle styles() reuses module-level Set + fragments**: cleared on each synchronous call instead of allocating per-call

## SSR

- `renderToString(vnode)` + `renderToStream(vnode)` with Suspense streaming
- Always call `mergeChildrenIntoProps(vnode)` before `runWithHooks`
- `runWithRequestContext(fn)` isolates context + store per request via ALS
- Island architecture: `island(loader, { name, hydrate })` for partial hydration
