# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **@pyreon/manifest** (private) — Internal type package providing `PackageManifest`, `ApiEntry`, and `defineManifest()`. Foundation for T2.1 single-source doc manifest pipeline. No external consumers in this release; follow-up PRs add the generator and migrate individual packages.
- **`scripts/gen-docs.ts` + `bun run gen-docs`** — Walks every `packages/<category>/<pkg>/manifest.ts` and regenerates `llms.txt` bullets in place. `--check` flag exits non-zero when files are out of sync (local equivalent of the CI `Docs Sync` gate). First real consumer: `@pyreon/flow` — its hand-written `llms.txt` entry now generates from `packages/fundamentals/flow/manifest.ts`. Contributors editing migrated packages edit the manifest, not the generated output.
- **CI `Docs Sync` job** — Runs `bun run gen-docs --check` and fails on drift. `--check` flag prints a unified diff (LCS-based) of exactly what would change, so reviewers see the fix without re-running the generator locally.

### Changed (internal convention)

- **Manifests now live at `packages/<category>/<pkg>/src/manifest.ts`** (previously at package root). Matches each package's `rootDir: "./src"` tsconfig constraint — `tsc --noEmit` now type-checks manifests uniformly with the rest of the package sources, and test files importing a manifest stay inside rootDir. No API change; the generator walks the new location and the integration test iterates it.

### Security

- **@pyreon/runtime-server** — `<For>` SSR key markers (`<!--k:KEY-->`) now URL-encode keys and replace every `-` with `%2D` so user-controlled keys can never form `-->` and break out of the HTML comment. Previously, a key of `'--><script>…</script><!--'` from untrusted data (DB, URL params, user input) produced executable markup when the browser parsed the SSR output. The fix ships with a symmetric `decodeKeyFromMarker` helper for future hydration or devtools consumers.
- **@pyreon/runtime-server** — Dev-mode warning when `vnode.type` (tag name) contains characters that would break HTML structure (`<`, `>`, spaces, etc.). The framework does not HTML-escape tag names (matches React/Vue/Solid) — responsibility is on the caller — but the warning surfaces the mistake before it reaches production.

### Changed (Breaking)

- **@pyreon/core** — `RefProp<T>` narrowed from `Ref<T> | RefCallback<T> | ((el: T) => void)` to `Ref<T> | RefCallback<T>`. The mount-only `(el: T) => void` arm lied to consumers: since PR #233 the runtime always invokes callback refs with `null` on unmount, so the narrow type (which rejected `null`) silently produced runtime bugs. Migration: change `ref={(el: HTMLDivElement) => ...}` handlers to `ref={(el: HTMLDivElement | null) => ...}` and handle the null case (null means unmount). Alternatively, use an object `Ref<T>` and read `ref.current`.

### Fixed

- **@pyreon/runtime-dom** — Reactive `style` object now removes stale keys when they disappear between renders. `{ color, fontSize }` → `{ color }` previously left `fontSize` on the element; now the key is removed via `el.style.removeProperty`. Matches React/Vue/Solid behavior.
- **@pyreon/runtime-dom** — Callback refs now receive `null` on unmount (matches React/Solid/Vue `RefCallback<T>` shape). Previously only object refs had `.current` nulled; function refs were called on mount but never on unmount, silently leaking resources held in user closures (observers, event listeners, DOM refs).
- **@pyreon/runtime-dom** — `Transition`/`TransitionGroup` 5s safety timer is now cleared when `transitionend` fires normally. Previously each completed transition leaked one pending 5s timer; heavy animations accumulated 100s of timer refs + closures.
- **@pyreon/core** — `mergeProps` now forces `configurable: true` on copied property descriptors. Without this, a getter with unset `configurable` (default `false`) caused `TypeError: Cannot redefine property` when a later source overrode that key.
- **@pyreon/core** — `splitProps` and `mergeProps` now preserve symbol-keyed properties via `Reflect.ownKeys`. Framework brands (`REACTIVE_PROP`, `PROPS_SIGNAL`) were previously dropped on split and merge.
- **@pyreon/fundamentals/storage** — Cross-tab `storage` event listener now refcounts active subscribers and detaches when the count hits zero. Previously the listener attached on first `useStorage()` and stayed for the app lifetime, holding closures over the key registry.
- **@pyreon/fundamentals/flow** — Added `useFlow(config)` — component-scoped wrapper around `createFlow` that auto-disposes on unmount.

## [0.1.1] - 2026-03-15

### Added

- **@pyreon/reactivity** — Signal-based fine-grained reactivity: `signal`, `computed`, `effect`, `batch`, `createSelector`, `createStore`, `createResource`
- **@pyreon/core** — Component model with `h()`, JSX runtime, `Fragment`, `For`, `Show`, `Portal`, `Suspense`, `ErrorBoundary`, `lazy`, context, lifecycle hooks
- **@pyreon/runtime-dom** — DOM renderer: `mount`, `hydrateRoot`, `Transition`, `TransitionGroup`, `KeepAlive`, configurable HTML sanitization
- **@pyreon/runtime-server** — SSR primitives: `renderToString`, `renderToStream` with Suspense streaming
- **@pyreon/compiler** — JSX transform with `shouldWrap` optimization and static node hoisting
- **@pyreon/router** — Client-side router: hash/history modes, nested routes, navigation guards, data loaders, link prefetching, scroll restoration, typed params
- **@pyreon/head** — Document head management: `useHead`, `HeadProvider`, `renderWithHead` for SSR
- **@pyreon/server** — SSR framework: `createHandler`, `prerender` (SSG), `island()` architecture with load/idle/visible/media/never hydration strategies
- **@pyreon/vite-plugin** — Vite integration: JSX transform, `.pyreon` file support, HMR with signal state preservation
- **@pyreon/react-compat** — React API shims: `useState`, `useEffect`, `useMemo`, `useRef`, `useCallback`, `lazy`, `Suspense`, `memo`, `createContext`
- **@pyreon/vue-compat** — Vue 3 Composition API shims
- **@pyreon/solid-compat** — SolidJS API shims
- **@pyreon/preact-compat** — Preact API shims
