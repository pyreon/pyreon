# @pyreon/svelte-compat

## 0.15.0

### Minor Changes

- Initial release. Svelte-compatible **importable runtime API** powered by
  Pyreon's signal-based reactive engine — the fifth compat layer alongside
  react / preact / vue / solid.

  Shims the APIs Svelte code actually `import`s:

  - **`svelte/store`** — `writable`, `readable`, `derived` (sync + async/
    cleanup forms), `get`, `readonly`. Backed by Pyreon `signal`; the store
    contract (`subscribe(run, invalidate?) → unsubscribe`, lazy
    `start(set, update?) → stop` notifier with `0→1` / `1→0` semantics)
    matches Svelte exactly.
  - **`svelte`** — `onMount`, `onDestroy`, `beforeUpdate`, `afterUpdate`,
    `tick`, `setContext`, `getContext`, `hasContext`, `getAllContexts`,
    `createEventDispatcher`, `mount`, `unmount`, `flushSync`.
  - Re-exports `For` / `Show` / `Switch` / `Match` / `Suspense` /
    `ErrorBoundary` from `@pyreon/core` for control-flow parity.

  Scope boundary (same as solid-compat draws around Solid's compiler): no
  `.svelte` SFC compiler, no Svelte 5 rune *syntax* (`$state`/`$derived`/
  `$effect`) — those are compiler constructs, not runtime imports.

  Documented behavioural boundaries: `beforeUpdate`/`afterUpdate` map to a
  post-first-render hook (the compat wrapper re-renders by teardown+rebuild,
  no per-update diff); `getAllContexts` returns an empty `Map`.

  Wired into `@pyreon/vite-plugin` via `pyreon({ compat: 'svelte' })`,
  covered by unit + real-Chromium browser smoke + the compat-layers e2e
  gate (`examples/svelte-compat`).
