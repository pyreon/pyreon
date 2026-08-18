# Architecture Rules

## Monorepo Structure

- All packages under `packages/` with `@pyreon/*` scope
- Examples under `examples/` — also part of the workspace
- Workspace resolution via `"bun"` condition — no build step for dev
- Dependencies between packages use workspace protocol
- **Bootstrap on fresh install + drift detection**: `postinstall` runs `scripts/bootstrap.ts` which builds all packages if any `lib/` directory is missing OR if any package's source is newer than its `lib/` (mtime drift). This is required because Vite's config bundler hardcodes `conditions: ["node"]` and needs `lib/*.js` — not the TypeScript source. You do NOT need to run `bun run build` manually after cloning or creating a worktree. **You DO need to re-run `bun install` (or `bun scripts/bootstrap.ts` directly) after `git pull` / `git checkout` if the diff touches package sources** — otherwise example builds use stale lib code and silently fail or produce wrong output. The bootstrap takes ~30ms when clean (mtime walk only), ~45s when rebuilding.
- **Bootstrap fails loudly on partial state.** After the build subprocess returns, the bootstrap re-runs the dirty-detection check against each originally-dirty package. If any are still missing or stale, the script exits nonzero — even on the postinstall path. Pre-fix the postinstall path swallowed silently (rationale: aborting `bun install` over a transient lib build is worse than continuing). Gap #3 closed that hole: silent partial state is worse than a failed install, because devs running `bun run dev` use the bun condition → `src/` and never touch `lib/` — they don't notice missing `lib/` until production-build time, far from the cause. Escape hatch: `PYREON_BOOTSTRAP_SOFT=1` swallows the postcondition failure (install completes; consumers see confusing build errors until you re-run bootstrap manually).
- **Bootstrap content + retry (gap #6 + #3 follow-up).** Two defensive layers on top of the postcondition check: (1) `lib/index.js` content sanity — flags <50-byte output as `[stale]` to catch crashed-mid-write / 0-byte / structurally-broken builds that the existence + mtime checks miss. Applied in BOTH dirty-detection (catches broken lib from a prior crashed run) AND postcondition (catches a current-run build that emitted empty output). (2) Single sequential retry pass — if any packages are still dirty after the first build, retry ONLY those packages, one at a time, via per-package `bun run --filter='@pyreon/X' build`. Capped at one retry; never recurses. Counter line on success: `[bootstrap] Retry recovered N package(s) (first-pass-failed: M, retry-fixed: N, still-dirty: K)`. Defends against transient flake (topological-order race, file-handle limits, native-binary link race after `bun install`) without hiding genuinely-broken packages.

## TypeScript config presets (@pyreon/tsconfig)

- The repo's TypeScript options have ONE home: `packages/internals/tsconfig/`
  (`@pyreon/tsconfig`, private). `base.json` DOGFOODS the published
  `@pyreon/typescript` (extends it — every repo typecheck exercises the shipped
  consumer presets) and layers the repo delta: bun `customConditions`,
  `isolatedModules`, `jsx: preserve`, `allowImportingTsExtensions`, plus a
  verbatim parity block (esModuleInterop/allowJs/declaration/declarationMap/
  inlineSources/noEmit/types:[node]) for what the old `@vitus-labs` chain
  provided — the switch changed ZERO effective options (tsc --showConfig
  diffed per preset shape). The root `tsconfig.json` extends it.
- Every `packages/<cat>/<pkg>/tsconfig.json` extends `@pyreon/tsconfig/lib.json`
  (no JSX) or `lib-jsx.json` (JSX in src/tests); private tool packages whose tests
  import root `scripts/*.ts` use `internal.json` (no `rootDir` — TS6059 otherwise);
  examples extend `example.json` (or `example-bun.json` for the standalone
  bun-typed ones). Path options use `${configDir}` (TS ≥5.5) so they resolve
  against the EXTENDING package — the historical reason every package repeated
  `outDir`/`rootDir` inline.
- Consumption is by BARE specifier + a `"@pyreon/tsconfig": "workspace:*"`
  devDependency in every consumer (bun links the member; TS resolves `extends`
  through the exports map) — depth-independent and an honest dependency graph,
  the same model as `@pyreon/vitest-config`. NOTE: bun links workspace members
  ONLY where depended on — a bare `extends` without the devDep does NOT resolve.
- Per-package deviations stay in the package file as explicit overrides on top of
  the preset (extra `types`, `paths`, `exclude`, declaration-emit blocks). Never
  copy a repo-wide option into N files — change `base.json`.
- Enforced by `scripts/check-tsconfig-presets.ts` (validate-fast + pre-push):
  every package/example tsconfig must extend a preset; template trees
  (`create-zero`/`create-multiplatform` `templates/`) are user-shipped and never
  scanned; deliberate opt-outs go in `EXEMPT` with a rationale.

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
- Signal subscriptions: inline single-subscriber slot (`_d1`) promoting to `Set` on the 2nd subscriber; batch uses pointer swap
- `mountFor` keyed reconciler with LIS algorithm. Three-tier fast path in `computeForLis` (`packages/core/runtime-dom/src/nodes.ts`): (1) **extend** when `v > lastV` — O(1), covers append; (2) **known slot** when `tails[v] === v` — O(1), covers prepend and other piecewise-monotonic shapes; (3) binary search fallback. Only tier 3 emits `runtime.mountFor.lisOps`; a 1k→2k prepend is 0 probes, random shuffles stay at ~O(n log n).
- `mountFor` pure-contiguous-removal fast path (`tryContiguousRemoval` — the krausest `remove` op): a common-prefix + common-suffix `===` scan of `currentKeys` vs `newKeys` (mirroring Solid's `mapArray`). When `newKeys` is `currentKeys` with a single contiguous run deleted (no adds, no survivor reorder — gated on `n < currentKeys.length` AND `prefix + suffix === n`), it unmounts just the removed rows and skips the general path's per-key `cache.has` probe, full-cache stale `Set` scan, AND the all-stay LIS entirely — ~4n Map/Set ops replaced by an O(n) primitive scan + O(removed) teardown. Emits `runtime.mountFor.removeFast`; falls through unchanged for reorders, adds, and scattered removals. Isolated (reflow-free happy-dom) A/B: a 1000-row middle-remove reconcile drops ~72µs → ~25µs (~2.8×). NOTE the improvement is JS-only — the real-Chromium `remove` benchmark is browser-reflow-dominated (~6.8ms), so this saving is below the timing-resolution floor there (remove stays a statistical tie with Solid).
- `mountFor` pure-contiguous-INSERTION fast path (`tryContiguousInsertion` — the removal mirror; the krausest `append` op, plus prepend and middle-insert): same prefix/suffix `===` scan, gated on `n > currentKeys.length` AND `prefix + suffix === oldLen` (every old key survives in order ⟹ nothing can be stale and no survivor moves). Mounts the inserted run into a DocumentFragment and lands it with ONE live `insertBefore` before the suffix's first anchor (or the tail marker), skipping the general path's O(n) `cache.has` pre-pass, the newKey-Set build + full-cache stale scan, AND the O(n) LIS walk. Ported to `mountKeyedList` as `tryContiguousInsertionKeyed` (guarded on all-keyed vnodes so key↔vnode indices align; the shared curPos/currentKeyOrder tail still runs). Duplicate run keys are SKIPPED with `mountNewForEntries`' first-wins semantics, so warned-invalid input behaves identically to the general path. Emits `runtime.mountFor.insertFast` (both reconcilers). Isolated (reflow-free happy-dom, state-verified both arms) A/B on a 10k-row list: append-1k reconcile 9.06ms → 5.08ms (~1.8×); prepend-1k 65ms → 5.8ms (~11×, happy-dom-flavored — the general path mounted at the tail then MOVED all 1000 rows to the head; the fast path does zero moves, so the real-browser win is smaller but the eliminated work is real in any DOM). Locked by `for-contiguous-insertion.test.tsx` (bisect-verified both directions) + the big-list `insertFast` counter locks.
- `mountFor` owns-parent bulk CLEAR + full-REPLACE (`handleFastClear` / `handleReplaceAll`, keyed-array clear sibling in `mountKeyedList`): when the For's markers are the parent's first+last children, a clear (`items → []`) or full replace (no surviving key) wipes the block IN PLACE with ONE native `replaceChildren(startMarker[, frag], tailMarker)` call; shared-parent shapes fall back to the per-node `clearBetween` walk. Emits `runtime.mountFor.clearFast` / `runtime.mountFor.replaceFast`. **This deliberately replaced a `cloneNode(false)` + `replaceChild` parent SWAP** that was measured ~20µs/1000-rows FASTER on-CPU in real Chromium (interleaved CPU-profile A/B 2026-08-17, load ~3: swap ~60µs vs replaceChildren ~80µs total clear — the swap never unlinks children individually, they orphan wholesale with the discarded parent) but silently REPLACED the parent element, dropping its expando-delegated handlers (`__ev_*`), refs, observers, and direct listeners — `<ul onClick={…}><For …/></ul>` lost its click handler on the first clear. Correctness > performance; the delta sits inside the fair bench's 100µs timer quantum, and happy-dom (JS-DOM) clears/replaces are ~5–10% FASTER with the in-place form. Identity-preserving alternatives measured and rejected: `textContent=''` (~80µs, tie with replaceChildren but 3 calls), detach-clear-reinsert (~93µs — clearing a DETACHED subtree costs the same per-child unlinking, so the detach buys nothing). **The clear op's decomposition below is SUPERSEDED (2026-08-17 figures, corrected 2026-08 by PR #2912) — DOM remove-all still stands, the two "disposer" terms do not: they were the SAME work, one counted twice via a V8-inlined frame, and neither was mandatory-floor teardown.** A subtree-attributed CDP profile (real Chromium, 1000 rows) found: `replaceChildren` (native DOM, in-place) ~49.6µs; the `<For>` effect body ~12.7µs; `createSelector.subscribe`'s disposer ~11.1µs — a fixable per-key registry duplicating the reconciler's own key map, not a mandatory cost; the per-row SIGNAL binding's own disposer ~0.9µs. See `.claude/skills/pyreon-benchmarks/SKILL.md`'s "`clear rows`: the corrected diagnosis" for the full decomposition and the fix (open PR #2912) that narrows `clear rows` from ~1.47× to ~1.15× behind Octane without closing the gap. Locked by `for-clear-replace-fast.test.tsx` (parent-identity + counter specs, bisect-verified both directions).
- `_elementDepth` optimization: nested elements skip DOM removal closures
- **Single accessor invocation at mount for textish accessor children** (`mount.ts:mountAccessorChild`): mountChild's old shape ran every function child TWICE at mount — an untracked classification sample plus the binding machinery's tracked first run (~12k invocations for 6k table cells; the sampled VALUE can never replace the tracked run, because that run's invocation is what establishes subscriptions). Classification now happens INSIDE the binding's first tracked run: textish (string/number/boolean) initials — the dominant per-cell shape — run ONCE (renderEffect + `createPolyTextCore`, byte-equal semantics to `bindPolymorphicText`); keyed-array and general (VNode/null) initials hand off to `mountKeyedList`/`mountReactive` unchanged (they own effect()-grade semantics: ErrorBoundary routing, onUpdate notify, re-entrant generation guard) and deliberately keep the 2-invocation shape — the dispatcher's transient first-run subscriptions are dropped via dispose. The compiled template path (`_bindText`/`bindPolymorphicText` emitted directly) was always single-call and is untouched. The hydration walker (`hydrateReactiveChild`) still samples untracked before adoption — same class, tracked as a follow-up (adoption decisions need the value before DOM surgery, and a hydration PR is in flight).
- `renderEffect` uses local array for deps (lighter than `effect()`)
- **Devtools gated on `__DEV__`**: `compId` generation, `_mountingStack`, `registerComponent`/`unregisterComponent` are all behind `if (__DEV__)` — zero cost in production builds (Vite tree-shakes the entire devtools module)
- **Lazy allocation**: `EffectScope._effects`/`._updateHooks`, `LifecycleHooks.mount`/`.unmount`/`.update`/`.error`, and `mountCleanups` start as `null` — only allocated when first hook/effect is registered
- **makeReactiveProps copy-on-first-reactive-prop**: ONE pass. A static-only component (60%+) never allocates a result object — the input is returned as-is. The first `REACTIVE_PROP`-branded value starts the copy and backfills the keys already scanned; the rest are copied as the same pass continues. (Was scan-then-build, which read every key TWICE for any component carrying a compiler-wrapped reactive prop — i.e. every child of a `foo={props.x}`.)
- **`jsx()` zero-copy path**: a childless, keyless element hands its props object straight to `h()`. Both other paths reduce to "return props unchanged" for that shape — one copies every data property, the other re-defines every descriptor, and neither adds or removes a key — so the copy plus `Object.getOwnPropertyDescriptors` (one descriptor object PER KEY) is pure overhead, and passing the original preserves getter-shaped reactive props by construction. Covers `<Comp prop={x} />`, `<img src=… />`, `<Icon name=… />`. Elements WITH children still take the copying paths, where `children` genuinely has to move between `props` and the VNode child list.
- **omit() accepts pre-built `Set<string>`**: rocketstyle caches the Set at definition time, avoids per-mount Set construction
- **Unistyle styles() reuses module-level Set + fragments**: cleared on each synchronous call instead of allocating per-call

## SSR

- `renderToString(vnode)` + `renderToStream(vnode)` with Suspense streaming
- Always call `mergeChildrenIntoProps(vnode)` before `runWithHooks`
- `runWithRequestContext(fn)` isolates context + store per request via ALS
- Island architecture: `island(loader, { name, hydrate })` for partial hydration
