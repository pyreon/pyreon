# Architecture Rules

## Monorepo Structure

- All packages under `packages/` with `@pyreon/*` scope
- Examples under `examples/` — also part of the workspace
- Workspace resolution via `"bun"` condition — no build step for dev
- Dependencies between packages use workspace protocol

### Bootstrap

- `postinstall` runs `scripts/bootstrap.ts`, which rebuilds a package when its source-content hash differs from the one recorded in the gitignored `.bootstrap-cache.json`, or when its `lib/` is missing or broken. It is needed because Vite's config bundler resolves with `conditions: ["node"]` and reads `lib/*.js`, not source.
- Detection is content-based, not mtime-based: `touch`ing a file does not trigger a rebuild; change its content or delete `lib/`.
- You never need `bun run build` after cloning or creating a worktree. Re-run `bun install` (or `bun scripts/bootstrap.ts`) after a `git pull`/`checkout` that touches package sources, or example builds read stale `lib/`.
- A clean run is a hash walk (~80ms); a full rebuild takes ~45s.
- Safety layers:
  - A `lib/index.js` under 50 bytes counts as stale (crashed or empty build), both when detecting dirty packages and when checking the result.
  - Packages still dirty after the build are retried once, sequentially, via `bun run --filter='@pyreon/X' build`; success prints `[bootstrap] Retry recovered N package(s) …`.
  - If any package is still missing or stale afterwards, the script exits non-zero, including on the postinstall path. `PYREON_BOOTSTRAP_SOFT=1` lets the install complete anyway (builds then fail with confusing errors until you re-run bootstrap).

## TypeScript config presets (@pyreon/tsconfig)

- The repo's TypeScript options live in one place: `packages/internals/tsconfig/` (`@pyreon/tsconfig`, private). `base.json` extends the published `@pyreon/typescript` (so every repo typecheck exercises the shipped consumer presets) and adds the repo delta: bun `customConditions`, `isolatedModules`, `jsx: preserve`, `allowImportingTsExtensions`, plus esModuleInterop/allowJs/declaration/declarationMap/inlineSources/noEmit/`types: [node]`. The root `tsconfig.json` extends it.
- Every `packages/<cat>/<pkg>/tsconfig.json` extends `@pyreon/tsconfig/lib.json` (no JSX) or `lib-jsx.json` (JSX in src/tests). Private tool packages whose tests import root `scripts/*.ts` use `internal.json` (no `rootDir`, else TS6059). Examples extend `example.json` (or `example-bun.json` for the standalone bun-typed ones). Path options use `${configDir}` so they resolve against the extending package.
- Consume presets by bare specifier plus a `"@pyreon/tsconfig": "workspace:*"` devDependency. Bun links workspace members only where they are depended on, so a bare `extends` without the devDep does not resolve.
- Per-package deviations (extra `types`, `paths`, `exclude`, declaration-emit blocks) stay in the package file on top of the preset. Change a repo-wide option in `base.json`, never in N files.
- Enforced by `scripts/check-tsconfig-presets.ts` (validate-fast + pre-push). `create-zero`/`create-multiplatform` `templates/` trees are user-shipped and not scanned; deliberate opt-outs go in its `EXEMPT` list with a rationale.

## CI Requirements

- Every package and example must have `"lint": "oxlint ."` and `"typecheck": "tsc --noEmit"` scripts
- Root `lint` and `typecheck` run via `bun run --filter='*'` to cover all workspaces
- Always verify `bun run lint` and `bun run typecheck` pass before committing
- Examples use `noEmit: true` in tsconfig (not `rootDir`) since they include vite.config.ts

## Package Layers (dependency order)

1. `@pyreon/reactivity` — standalone, no framework deps
2. `@pyreon/core` — depends on reactivity
3. `@pyreon/compiler` — standalone JSX transform (oxc-parser + magic-string, with a Rust native backend)
4. `@pyreon/runtime-dom` — depends on core + reactivity
5. `@pyreon/runtime-server` — depends on core + reactivity
6. `@pyreon/router` — depends on core + reactivity
7. `@pyreon/head` — depends on core
8. `@pyreon/server` — depends on core + runtime-server
9. `@pyreon/vite-plugin` — depends on compiler
10. Compat packages — depend on core + reactivity

## Performance Principles

Reconciler functions below live in `packages/core/runtime-dom/src/nodes.ts` unless noted. Each fast path emits a `runtime.mountFor.*` perf counter and falls through to the general path when its precondition fails.

- Compiled templates use `_tpl()` (cloneNode) + `_bind()` — zero VNode allocations.
- Reactive text writes `TextNode.data`, not `.textContent`.
- Signals keep their first subscriber in an inline slot (`_s1` tracked, `_d1` direct) and promote to a `Set` on the second; batch uses a pointer swap.
- `mountFor` is a keyed reconciler using LIS. `computeForLis` has three tiers: extend when `v > lastV` (append, O(1)); known slot when `tails[v] === v` (prepend and piecewise-monotonic shapes, O(1)); binary search otherwise. Only tier 3 counts `lisOps`, so a prepend costs 0 probes.
- `tryContiguousRemoval` (`removeFast`): a common-prefix + common-suffix `===` scan detects a single contiguous deleted run (`n < currentKeys.length` and `prefix + suffix === n`) and unmounts only those rows, skipping the key probes, stale scan and LIS.
- `tryContiguousInsertion` (`insertFast`), and `tryContiguousInsertionKeyed` in `mountKeyedList`: the same scan detects a contiguous inserted run where every old key survives in order (`n > currentKeys.length` and `prefix + suffix === oldLen`). The run is built in a DocumentFragment and inserted with one `insertBefore`. Duplicate keys in the run follow `mountNewForEntries`' first-wins rule. Locked by `for-contiguous-insertion.test.tsx`.
- `handleFastClear` / `handleReplaceAll` (`clearFast` / `replaceFast`, with a keyed-array sibling in `mountKeyedList`): when the For's markers are the parent's first and last children, a clear or full replace runs one in-place `replaceChildren(startMarker[, frag], tailMarker)`; otherwise it walks nodes with `clearBetween`. Never swap the parent element (`cloneNode(false)` + `replaceChild`) even though it is faster — it drops the parent's delegated handlers, refs, observers and listeners. Locked by `for-clear-replace-fast.test.tsx`.
- `_elementDepth`: nested elements skip per-node DOM removal closures (they are removed with their parent).
- `mountAccessorChild` (`mount.ts`) classifies a textish accessor child inside the binding's first tracked run, so it is invoked once at mount (via `createPolyTextCore`, same semantics as `bindPolymorphicText`). Keyed-array and VNode/null initials hand off to `mountKeyedList`/`mountReactive`, which sample once untracked and run again tracked. The hydration walker (`hydrateReactiveChild`, `hydrate.ts`) also samples untracked, because adoption needs the value before touching the DOM.
- `renderEffect` stores deps in a local array (lighter than `effect()`).
- Devtools work (`compId`, `_mountingStack`, `registerComponent`/`unregisterComponent`) is behind `__DEV__` and tree-shaken in production.
- Lazy allocation: `EffectScope._effects`/`._updateHooks`, `LifecycleHooks.mount`/`.unmount`/`.update`/`.error` and `mountCleanups` start as `null`.
- `makeReactiveProps` copies on the first reactive prop in a single pass; a static-only component allocates no result object.
- `jsx()` hands a childless, keyless element's props straight to `h()` without copying, which also preserves getter props. Elements with children still copy, because `children` moves between props and the child list.
- `omit()` accepts a pre-built `Set<string>`; rocketstyle builds it once per definition.
- Unistyle `styles()` reuses a module-level Set and fragment buffer, cleared on each synchronous call.

## SSR

- `renderToString(vnode)` + `renderToStream(vnode)` with Suspense streaming
- Always call `mergeChildrenIntoProps(vnode)` before `runWithHooks`
- `runWithRequestContext(fn)` isolates context and store per request via ALS. Store isolation is automatic: `@pyreon/store` publishes its registry setter on a `globalThis` seam when loaded on a server, and `runtime-server` wires it at render time. `configureStoreIsolation` is only an override for a custom provider.
- Island architecture: `island(loader, { name, hydrate })` for partial hydration
