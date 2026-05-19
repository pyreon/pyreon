---
'@pyreon/svelte-compat': minor
'@pyreon/vite-plugin': patch
---

feat(svelte-compat): new compat layer — Svelte importable runtime API on Pyreon

`@pyreon/svelte-compat` is the fifth compat layer (alongside
react / preact / vue / solid). It shims the Svelte APIs code actually
`import`s, backed by Pyreon's signal-based reactive engine:

- **`svelte/store`** — `writable`, `readable`, `derived` (single +
  array, sync + async/cleanup forms), `get`, `readonly`. Store contract
  (`subscribe(run, invalidate?) → unsubscribe`, lazy
  `start(set, update?) → stop` notifier with `0→1` / `1→0` semantics)
  matches Svelte exactly.
- **`svelte`** — `onMount` (returned cleanup runs on destroy, per
  Svelte's contract), `onDestroy`, `beforeUpdate`, `afterUpdate`,
  `tick`, `setContext`, `getContext`, `hasContext`, `getAllContexts`,
  `createEventDispatcher`, `mount`, `unmount`, `flushSync`.
- Re-exports `For` / `Show` / `Switch` / `Match` / `Suspense` /
  `ErrorBoundary` for control-flow parity.

Scope boundary (same as solid-compat draws around Solid's compiler):
no `.svelte` SFC compiler, no Svelte 5 rune *syntax*
(`$state` / `$derived` / `$effect` / `$store` sugar) — compiler
constructs, not runtime imports. A component that subscribes to a store
in its body is the faithful equivalent of `$store` auto-subscription:
it re-renders on store change and auto-cleans on unmount.

`@pyreon/vite-plugin` (patch): `pyreon({ compat: 'svelte' })` now
aliases `svelte` / `svelte/store` → `@pyreon/svelte-compat` and routes
JSX through the compat runtime.

Covered by unit tests (51, coverage 97.7% stmts / 87.8% branch),
real-Chromium browser smoke (4), and the compat-layers e2e gate
(`examples/svelte-compat`, port 5182).
